"""
Equivalent of lib/supabase/client.ts and lib/supabase/server.ts

In TypeScript there were two clients: a browser client (client.ts) and a
server-side client with cookie handling (server.ts).  In Python there is only
one runtime environment (the server), so a single client is all you need.

Install:  pip install supabase python-dotenv
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]


def create_supabase_client() -> Client:
    """Return an anonymous Supabase client (read + RLS-gated writes)."""
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def create_supabase_service_client() -> Client:
    """
    Return a service-role client that bypasses RLS.
    Use this for server-side admin operations (auto-escalation, soc-pro detection).
    Requires SUPABASE_SERVICE_ROLE_KEY in your .env.
    """
    service_key: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(SUPABASE_URL, service_key)
