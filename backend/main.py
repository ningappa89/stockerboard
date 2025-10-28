from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import yfinance as yf
import pandas as pd

app = FastAPI(title="StockerBoard API")

# CORS (safe to keep even if not strictly needed for server-side calls)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/stocks/{symbol}")
def get_stock(
    symbol: str,
    period: str = "1mo",
    interval: str = "1d",
) -> Dict[str, Any]:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval=interval)
        if hist.empty:
            return {"symbol": symbol, "data": []}
        hist = hist.reset_index()  # Date as column
        # normalize datetime to ISO string for JSON safety
        hist["Date"] = pd.to_datetime(hist["Date"]).astype(str)
        cols = ["Date", "Open", "High", "Low", "Close", "Volume"]
        return {"symbol": symbol, "data": hist[cols].to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
