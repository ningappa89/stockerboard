import reflex as rx

config = rx.Config(
    app_name="stockerboard",
    backend_bridge=False,
    backend_host="127.0.0.1",
    backend_port=8000,
    api_url="http://127.0.0.1:8000",
    frontend_port=3000,
    deploy_url="http://127.0.0.1:3000",
    cors_allowed_origins=["*"],
)
