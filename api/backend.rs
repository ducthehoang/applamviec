use duoagency_backend::router::build_router;
use tower::ServiceBuilder;
use vercel_runtime::{axum::VercelLayer, run, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let router = build_router();
    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);

    run(app).await
}
