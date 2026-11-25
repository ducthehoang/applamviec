"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  ExternalLink,
  Film,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  MessageSquareText,
  Send,
  Square,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  AppButton,
  AppInput,
  AppSelect,
  BackButton,
  SectionHeader,
  StageBadge,
} from "@/components/ui-primitives";
import {
  createFolder,
  deleteFolder,
  deleteMediaFile,
  updateFolder,
  updateMediaFile,
  uploadMediaFileWithProgress,
} from "@/lib/api";
import { FolderItem, MediaFileItem, WorkStage } from "@/lib/types";

interface MediaVaultProps {
  actorEmail: string;
  folders: FolderItem[];
  files: MediaFileItem[];
  selectedMediaIds: string[];
  onToggleSelectMedia: (id: string) => void;
  onClearSelection: () => void;
  onPushToComposer: () => void;
  onRefreshData: () => Promise<void>;
}

const FOLDER_COLORS = [
  { value: "#6366f1", label: "Tím Indigo (Chiến dịch chính)" },
  { value: "#ec4899", label: "Hồng TikTok (Video ngắn / Reels)" },
  { value: "#10b981", label: "Xanh Ngọc (Sẵn sàng xuất bản)" },
  { value: "#f59e0b", label: "Vàng Hổ Phách (File quay thô)" },
  { value: "#0ea5e9", label: "Xanh Dương (Ảnh sản phẩm / Fanpage)" },
];

const FOLDER_STAGE_OPTIONS = [
  { value: "raw", label: "File thô (Mới tải)" },
  { value: "editing", label: "Đang hậu kỳ / Dựng" },
  { value: "ready", label: "Sẵn sàng đăng" },
  { value: "archived", label: "Lưu trữ" },
];

const FILE_STAGE_OPTIONS = [
  { value: "raw", label: "File thô (Mới tải)" },
  { value: "editing", label: "Đang hậu kỳ / Dựng" },
  { value: "ready", label: "Sẵn sàng đăng" },
  { value: "used", label: "Đã đăng lên kênh" },
];

const STAGE_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái công việc" },
  ...FILE_STAGE_OPTIONS,
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function MediaVault({
  actorEmail,
  folders,
  files,
  selectedMediaIds,
  onToggleSelectMedia,
  onClearSelection,
  onPushToComposer,
  onRefreshData,
}: MediaVaultProps) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Tạo folder mới
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#6366f1");
  const [newFolderStage, setNewFolderStage] =
    useState<FolderItem["stage"]>("raw");
  const [newFolderNote, setNewFolderNote] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Trạng thái upload nhiều file cùng lúc
  const [uploadQueue, setUploadQueue] = useState<
    Record<string, { name: string; progress: number; error?: string }>
  >({});

  // Ghi chú nhanh trên file & Xem trước lớn
  const [editingNoteFileId, setEditingNoteFileId] = useState<string | null>(null);
  const [draftNoteText, setDraftNoteText] = useState("");
  const [previewItem, setPreviewItem] = useState<MediaFileItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) || null,
    [folders, activeFolderId]
  );

  const visibleFolders = useMemo(
    () => folders.filter((f) => f.parent_id === activeFolderId),
    [folders, activeFolderId]
  );

  const visibleFiles = useMemo(() => {
    return files.filter((m) => {
      const matchFolder = activeFolderId
        ? m.folder_id === activeFolderId
        : true;
      const matchStage = stageFilter === "all" ? true : m.stage === stageFilter;
      const matchSearch = searchQuery.trim()
        ? m.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          m.quick_note.toLowerCase().includes(searchQuery.trim().toLowerCase())
        : true;
      return matchFolder && matchStage && matchSearch;
    });
  }, [files, activeFolderId, stageFilter, searchQuery]);

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    setActionError(null);
    try {
      await createFolder({
        parent_id: activeFolderId,
        name: newFolderName.trim(),
        color: newFolderColor,
        stage: newFolderStage,
        note: newFolderNote.trim(),
        actorEmail,
      });
      setNewFolderName("");
      setNewFolderNote("");
      setShowNewFolder(false);
      await onRefreshData();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Không thể tạo thư mục mới"
      );
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleFilesBatchUpload(fileList: FileList | File[]) {
    const arr = Array.from(fileList).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (arr.length === 0) {
      setActionError("Vui lòng chỉ kéo-thả hoặc chọn file Hình ảnh hoặc Video.");
      return;
    }
    setActionError(null);

    for (const file of arr) {
      const tempKey = `${file.name}-${Date.now()}-${Math.random()}`;
      setUploadQueue((prev) => ({
        ...prev,
        [tempKey]: { name: file.name, progress: 5 },
      }));

      try {
        await uploadMediaFileWithProgress({
          file,
          folderId: activeFolderId,
          actorEmail,
          onProgress: (pct) => {
            setUploadQueue((prev) => ({
              ...prev,
              [tempKey]: { name: file.name, progress: pct },
            }));
          },
        });
        setUploadQueue((prev) => {
          const copy = { ...prev };
          delete copy[tempKey];
          return copy;
        });
        await onRefreshData();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Lỗi tải file";
        setUploadQueue((prev) => ({
          ...prev,
          [tempKey]: { name: file.name, progress: 0, error: msg },
        }));
      }
    }
  }

  async function handleQuickStageChange(file: MediaFileItem, nextStage: string) {
    try {
      await updateMediaFile(file.id, {
        stage: nextStage as MediaFileItem["stage"],
      });
      await onRefreshData();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Lỗi cập nhật trạng thái file"
      );
    }
  }

  async function handleSaveQuickNote(fileId: string) {
    try {
      await updateMediaFile(fileId, { quick_note: draftNoteText.trim() });
      setEditingNoteFileId(null);
      await onRefreshData();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Lỗi lưu ghi chú nhanh"
      );
    }
  }

  async function handleFolderStageChange(
    folder: FolderItem,
    nextStage: string
  ) {
    try {
      await updateFolder(folder.id, {
        stage: nextStage as FolderItem["stage"],
      });
      await onRefreshData();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Lỗi cập nhật trạng thái folder"
      );
    }
  }

  async function handleRemoveFolder(folder: FolderItem) {
    if (
      !window.confirm(
        `Xóa folder "${folder.name}" khỏi danh sách quản lý chung?`
      )
    ) {
      return;
    }
    try {
      await deleteFolder(folder.id);
      if (activeFolderId === folder.id) {
        setActiveFolderId(folder.parent_id);
      }
      await onRefreshData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Lỗi xóa folder");
    }
  }

  async function handleRemoveFile(file: MediaFileItem) {
    if (!window.confirm(`Xóa file "${file.name}" khỏi kho chung?`)) return;
    try {
      await deleteMediaFile(file.id);
      await onRefreshData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Lỗi xóa file");
    }
  }

  const activeUploadEntries = Object.entries(uploadQueue);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={
          activeFolder
            ? `Thư mục: ${activeFolder.name}`
            : "Kho Folder & Hình ảnh / Video Chung"
        }
        subtitle={
          activeFolder
            ? activeFolder.note ||
              `Tạo bởi ${activeFolder.created_by} — Cả 2 thành viên cùng xem, thả file và lấy bài đăng ngay`
            : "Kéo-thả hàng loạt ảnh gốc & video TikTok/Reels. Tự động nén Thumbnail xem tức thì, lưu file gốc trên Google Drive 15GB."
        }
        actions={
          <>
            {activeFolder && (
              <BackButton
                label="Về thư mục gốc"
                onClick={() => setActiveFolderId(activeFolder.parent_id)}
              />
            )}
            <AppButton
              variant="secondary"
              size="md"
              icon={<FolderPlus className="w-4 h-4" />}
              onClick={() => setShowNewFolder((v) => !v)}
            >
              Tạo Folder mới
            </AppButton>
            <AppButton
              variant="primary"
              size="md"
              icon={<UploadCloud className="w-4 h-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Tải Ảnh / Video lên
            </AppButton>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void handleFilesBatchUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </>
        }
      />

      {/* Thanh nổi khi đã chọn ảnh/video để đẩy thẳng sang phần Đăng bài FB / TikTok */}
      {selectedMediaIds.length > 0 && (
        <div className="rounded-2xl bg-indigo-950/70 border border-indigo-500/40 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-indigo-100">
            Đã chọn{" "}
            <span className="font-semibold text-white">
              {selectedMediaIds.length} file media
            </span>{" "}
            để chuẩn bị đăng lên Fanpage Facebook / TikTok.
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              Bỏ chọn
            </AppButton>
            <AppButton
              variant="primary"
              size="sm"
              icon={<Send className="w-4 h-4" />}
              onClick={onPushToComposer}
            >
              Đưa sang Khung Lên Lịch &amp; Đăng Bài
            </AppButton>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-200 flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => setActionError(null)}
          >
            Đóng
          </AppButton>
        </div>
      )}

      {/* Khung tạo Folder mới */}
      {showNewFolder && (
        <form
          onSubmit={handleCreateFolder}
          className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AppInput
              label="Tên Folder chiến dịch / khách hàng"
              placeholder="VD: Tháng 12 - Video TikTok Sản phẩm A"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              required
            />
            <AppSelect
              label="Màu đánh dấu"
              value={newFolderColor}
              onChange={setNewFolderColor}
              options={FOLDER_COLORS}
            />
            <AppSelect
              label="Trạng thái hiện tại"
              value={newFolderStage}
              onChange={(v) => setNewFolderStage(v as FolderItem["stage"])}
              options={FOLDER_STAGE_OPTIONS}
            />
          </div>
          <AppInput
            label="Lời nhắn gắn thẳng trên bìa Folder (để người kia đọc là hiểu ngay, khỏi nhắn tin)"
            placeholder="VD: Đã lọc sẵn 12 tấm đẹp nhất, chiều nay lên Fanpage lúc 19h nhé!"
            value={newFolderNote}
            onChange={(e) => setNewFolderNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNewFolder(false)}
            >
              Hủy
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={creatingFolder}
            >
              {creatingFolder ? "Đang tạo..." : "Lưu Folder"}
            </AppButton>
          </div>
        </form>
      )}

      {/* Vùng Kéo - Thả trực tiếp */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) {
            void handleFilesBatchUpload(e.dataTransfer.files);
          }
        }}
        className={`rounded-2xl border-2 border-dashed p-5 transition-all text-center ${
          isDragging
            ? "border-indigo-400 bg-indigo-500/10"
            : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-slate-300 text-sm">
          <UploadCloud className="w-6 h-6 text-indigo-400 shrink-0" />
          <span>
            Kéo và thả trực tiếp nhiều{" "}
            <strong className="text-white">Hình ảnh / Video MP4</strong> vào đây{" "}
            {activeFolder
              ? `(vào thư mục "${activeFolder.name}")`
              : "(vào kho chung)"}
          </span>
        </div>

        {activeUploadEntries.length > 0 && (
          <div className="mt-4 space-y-2 text-left max-w-xl mx-auto">
            {activeUploadEntries.map(([key, item]) => (
              <div
                key={key}
                className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-xs"
              >
                <div className="flex justify-between mb-1">
                  <span className="truncate font-medium text-slate-200">
                    {item.name}
                  </span>
                  <span className="text-slate-400">
                    {item.error ? "Lỗi" : `${item.progress}%`}
                  </span>
                </div>
                {item.error ? (
                  <p className="text-rose-400">{item.error}</p>
                ) : (
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danh sách Folder */}
      {visibleFolders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Danh sách Folder ({visibleFolders.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleFolders.map((folder) => {
              const countInFolder = files.filter(
                (f) => f.folder_id === folder.id
              ).length;
              return (
                <div
                  key={folder.id}
                  className="rounded-2xl bg-slate-900/80 border border-slate-800/90 hover:border-slate-700 p-4 flex flex-col justify-between gap-3 transition-all"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveFolderId(folder.id)}
                        className="flex items-center gap-2.5 text-left group cursor-pointer"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${folder.color}22`,
                            color: folder.color,
                          }}
                        >
                          <Folder className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-white group-hover:text-indigo-300 transition-colors">
                            {folder.name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {countInFolder} file • bởi {folder.created_by}
                          </div>
                        </div>
                      </button>

                      <AppButton
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5 text-slate-400" />}
                        onClick={() => void handleRemoveFolder(folder)}
                        title="Xóa folder"
                      />
                    </div>

                    {folder.note && (
                      <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 px-3 py-2 text-xs text-slate-300">
                        📌 {folder.note}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
                    <StageBadge stage={folder.stage} />
                    <div className="flex items-center gap-1.5">
                      <AppSelect
                        value={folder.stage}
                        onChange={(val) =>
                          void handleFolderStageChange(folder, val)
                        }
                        options={FOLDER_STAGE_OPTIONS}
                        className="w-40"
                      />
                      <AppButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveFolderId(folder.id)}
                      >
                        Mở
                      </AppButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bộ lọc & Tìm kiếm File */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end justify-between pt-2">
        <div className="flex-1 max-w-md">
          <AppInput
            label="Tìm nhanh theo tên file hoặc nội dung ghi chú"
            placeholder="Nhập tên ảnh, video hoặc lời nhắn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-64">
          <AppSelect
            label="Lọc tiến độ xử lý"
            value={stageFilter}
            onChange={setStageFilter}
            options={STAGE_FILTER_OPTIONS}
          />
        </div>
      </div>

      {/* Lưới Hình Ảnh & Video */}
      {visibleFiles.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-10 text-center text-sm text-slate-400">
          Chưa có hình ảnh hoặc video nào trong bộ lọc hiện tại. Hãy bấm{" "}
          <strong className="text-slate-200">Tải Ảnh / Video lên</strong> hoặc
          kéo-thả file vào khung phía trên.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleFiles.map((file) => {
            const isSelected = selectedMediaIds.includes(file.id);
            const isEditingNote = editingNoteFileId === file.id;

            return (
              <div
                key={file.id}
                className={`rounded-2xl bg-slate-900/90 border overflow-hidden flex flex-col justify-between transition-all ${
                  isSelected
                    ? "border-indigo-500 ring-2 ring-indigo-500/30"
                    : "border-slate-800/90 hover:border-slate-700"
                }`}
              >
                {/* Ảnh thu nhỏ */}
                <div>
                  <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                    {file.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={file.thumbnail_url}
                        alt={file.name}
                        onClick={() => setPreviewItem(file)}
                        className="w-full h-full object-cover cursor-pointer hover:scale-[1.02] transition-transform"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPreviewItem(file)}
                        className="flex flex-col items-center gap-1.5 text-slate-500 cursor-pointer"
                      >
                        {file.media_kind === "video" ? (
                          <Film className="w-8 h-8 text-pink-400" />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-indigo-400" />
                        )}
                        <span className="text-xs">Bấm để xem thông tin</span>
                      </button>
                    )}

                    {/* Nút chọn để đăng bài */}
                    <button
                      type="button"
                      onClick={() => onToggleSelectMedia(file.id)}
                      className={`absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 backdrop-blur-md cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-950/75 text-slate-200 hover:bg-slate-900"
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      {isSelected ? "Đã chọn đăng" : "Chọn đăng"}
                    </button>

                    {/* Nhãn loại file */}
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 text-[11px] font-medium text-slate-200">
                      {file.media_kind === "video"
                        ? `VIDEO${
                            file.duration_sec ? ` • ${file.duration_sec}s` : ""
                          }`
                        : "ẢNH"}
                    </span>
                  </div>

                  {/* Nội dung thông tin file */}
                  <div className="p-3.5 space-y-2.5">
                    <div>
                      <div
                        className="text-sm font-medium text-white truncate"
                        title={file.name}
                      >
                        {file.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {formatBytes(file.size_bytes)}
                        {file.width && file.height
                          ? ` • ${file.width}×${file.height}`
                          : ""}{" "}
                        • {file.uploaded_by}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <StageBadge stage={file.stage as WorkStage} />
                      {file.gdrive_web_link && (
                        <a
                          href={file.gdrive_web_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          File gốc Drive
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Ghi chú nhanh giữa 2 thành viên */}
                    {isEditingNote ? (
                      <div className="space-y-2 pt-1">
                        <AppInput
                          placeholder="Ghi chú nhanh cho người kia..."
                          value={draftNoteText}
                          onChange={(e) => setDraftNoteText(e.target.value)}
                        />
                        <div className="flex justify-end gap-1.5">
                          <AppButton
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingNoteFileId(null)}
                          >
                            Hủy
                          </AppButton>
                          <AppButton
                            variant="primary"
                            size="sm"
                            onClick={() => void handleSaveQuickNote(file.id)}
                          >
                            Lưu
                          </AppButton>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingNoteFileId(file.id);
                          setDraftNoteText(file.quick_note || "");
                        }}
                        className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-2.5 py-2 text-xs text-slate-300 hover:border-slate-700 cursor-pointer flex items-start gap-1.5"
                      >
                        <MessageSquareText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          {file.quick_note ||
                            "Bấm để gắn lời nhắn trên file này..."}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Thanh đổi trạng thái 1 chạm & Xóa */}
                <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-800/70 flex items-center justify-between gap-2">
                  <AppSelect
                    value={file.stage}
                    onChange={(val) => void handleQuickStageChange(file, val)}
                    options={FILE_STAGE_OPTIONS}
                    className="flex-1"
                  />
                  <AppButton
                    variant="danger"
                    size="sm"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => void handleRemoveFile(file)}
                    title="Xóa file"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal xem trước thông tin chi tiết File */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="truncate font-semibold text-sm text-white">
                {previewItem.name}
              </div>
              <AppButton
                variant="ghost"
                size="sm"
                icon={<X className="w-4 h-4" />}
                onClick={() => setPreviewItem(null)}
              >
                Đóng
              </AppButton>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[65vh] overflow-auto">
              {previewItem.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewItem.thumbnail_url}
                  alt={previewItem.name}
                  className="max-h-[58vh] rounded-xl object-contain"
                />
              ) : (
                <div className="py-12 text-slate-400 text-sm">
                  Không có ảnh xem trước cục bộ — Mở trực tiếp trên Google Drive.
                </div>
              )}
            </div>
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
              <div>
                Dung lượng: <strong>{formatBytes(previewItem.size_bytes)}</strong>{" "}
                • Người tải: <strong>{previewItem.uploaded_by}</strong>
              </div>
              <div className="flex items-center gap-2">
                {previewItem.gdrive_web_link && (
                  <a
                    href={previewItem.gdrive_web_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <AppButton
                      variant="secondary"
                      size="sm"
                      icon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      Mở file gốc trên Google Drive
                    </AppButton>
                  </a>
                )}
                <AppButton
                  variant="primary"
                  size="sm"
                  icon={<Send className="w-3.5 h-3.5" />}
                  onClick={() => {
                    if (!selectedMediaIds.includes(previewItem.id)) {
                      onToggleSelectMedia(previewItem.id);
                    }
                    setPreviewItem(null);
                    onPushToComposer();
                  }}
                >
                  Dùng file này để Đăng bài ngay
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
