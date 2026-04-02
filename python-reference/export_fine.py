"""
Equivalent of app/api/export-fine/route.ts

FastAPI endpoint that appends a paid fine to the Google Sheet
"Fine Processing Form" tab.

Install:
    pip install fastapi uvicorn google-api-python-client google-auth python-dotenv

Run (standalone):
    uvicorn export_fine:app --reload --port 8000

Or call export_fine_to_sheet() directly as a helper function.
"""

import os
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from google.oauth2 import service_account
from googleapiclient.discovery import build
from pydantic import BaseModel

load_dotenv()

SPREADSHEET_ID = "17C4lp6_ZSaxi7bb58upLxrfUrtNuRKiiy_VpVWbuIQ0"
SHEET_NAME = "Fine Processing Form"

app = FastAPI()


class ExportFineRequest(BaseModel):
    member_name: Optional[str] = None
    fine_type: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    date_resolved: Optional[str] = None


def export_fine_to_sheet(
    member_name: Optional[str],
    fine_type: Optional[str],
    description: Optional[str],
    amount: Optional[float],
    date_resolved: Optional[str],
) -> None:
    """
    Appends one row to the Google Sheet.
    Columns: A=Timestamp, B=Member, C=Date Processed, D=Reason, E=Cost, F=Budget (manual)
    """
    private_key = os.environ["GOOGLE_PRIVATE_KEY"].replace("\\n", "\n")
    client_email = os.environ["GOOGLE_SERVICE_ACCOUNT_EMAIL"]

    credentials = service_account.Credentials.from_service_account_info(
        {
            "type": "service_account",
            "client_email": client_email,
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
        },
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )

    service = build("sheets", "v4", credentials=credentials)

    timestamp = datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p")
    reason = f"{fine_type or ''} — {description or ''}"
    cost = f"${amount:.2f}" if amount is not None else ""

    row = [timestamp, member_name or "", date_resolved or "", reason, cost, ""]

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A2:F",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",  # must be INSERT_ROWS, not OVERWRITE
        body={"values": [row]},
    ).execute()


@app.post("/api/export-fine")
async def post_export_fine(
    body: ExportFineRequest,
    authorization: Optional[str] = Header(default=None),
):
    """
    POST /api/export-fine
    Requires Authorization: Bearer <SUPABASE_ANON_KEY> header.
    """
    expected = f"Bearer {os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        export_fine_to_sheet(
            member_name=body.member_name,
            fine_type=body.fine_type,
            description=body.description,
            amount=body.amount,
            date_resolved=body.date_resolved,
        )
        return JSONResponse({"success": True})
    except Exception as exc:
        print(f"Google Sheets export error: {exc}")
        raise HTTPException(status_code=500, detail="Export failed")
