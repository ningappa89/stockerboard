from fastapi import APIRouter
import yfinance as yf
import pandas as pd

router = APIRouter()

@router.get("/{symbol}")
def get_stock(symbol: str, period: str = "1mo", interval: str = "1d"):
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval=interval)
    if hist.empty:
        return {"error": "no data"}
    # Convert index to iso timestamps and send JSON
    hist = hist.reset_index()
    return {"symbol": symbol, "data": hist[['Date','Open','High','Low','Close','Volume']].to_dict(orient="records")}

#----------- Compute indicators server-side (EMA, RSI, MACD)

import ta

def compute_indicators(df):
    df['ema20'] = df['Close'].ewm(span=20).mean()
    df['rsi14'] = ta.momentum.rsi(df['Close'], window=14)
    macd = ta.trend.MACD(df['Close'])
    df['macd'] = macd.macd()
    df['macd_signal'] = macd.macd_signal()
    return df
