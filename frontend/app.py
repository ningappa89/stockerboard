import reflex as rx
import requests

API_BASE = "http://127.0.0.1:8000"

class TestState(rx.State):
    status: str = "Not tested"
    color: str = "gray"

    def ping(self):
        try:
            r = requests.get(f"{API_BASE}/health", timeout=10)
            r.raise_for_status()
            self.status = "✅ Backend Connected"
            self.color = "green"
        except Exception as e:
            self.status = f"❌ Backend FAILED: {str(e)}"
            self.color = "red"


def index():
    return rx.center(
        rx.vstack(
            rx.heading("StockerBoard — Connection Test"),
            rx.button("Ping Backend /health", on_click=TestState.ping),
            rx.badge(TestState.status, color_scheme=TestState.color),
            spacing="5",
            padding="20px",
        )
    )

app = rx.App()
app.add_page(index, title="StockerBoard — Test Interface")
