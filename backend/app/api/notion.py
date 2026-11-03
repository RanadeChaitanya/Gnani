"""Export a note to Notion as a page (server-side: the Notion secret never reaches the phone)."""
import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..config import get_settings
from .calls import _device
from .rooms import ApiError, _rate_limit

router = APIRouter(prefix="/api")
MAX_BLOCKS = 100  # Notion's per-request limit


class NotionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    markdown: str = Field(max_length=20000)


def _text(s: str) -> list[dict[str, Any]]:
    """`**bold**` → bold runs; Notion caps one run at 2000 chars."""
    out = []
    for i, part in enumerate(re.split(r"\*\*", s)):
        if part:
            out.append({"type": "text", "text": {"content": part[:2000]}, "annotations": {"bold": i % 2 == 1}})
    return out


def md_to_blocks(md: str) -> list[dict[str, Any]]:
    """Just the shapes our own Markdown export produces: headings, bullets, tables, paragraphs."""
    blocks: list[dict[str, Any]] = []
    for line in md.splitlines():
        line = line.rstrip()
        if not line or line.startswith("# ") or re.fullmatch(r"\|[\s:|-]+\|", line):
            continue  # the H1 is the page title; table separator rows carry nothing
        if line.startswith("## "):
            kind, body = "heading_2", line[3:]
        elif line.startswith("### "):
            kind, body = "heading_3", line[4:]
        elif line.startswith(("- ", "* ")):
            kind, body = "bulleted_list_item", line[2:]
        elif line.startswith("|"):
            kind, body = "bulleted_list_item", " · ".join(c.strip() for c in line.strip("|").split("|") if c.strip())
        else:
            kind, body = "paragraph", line
        blocks.append({"object": "block", "type": kind, kind: {"rich_text": _text(body)}})
    return blocks[:MAX_BLOCKS]


@router.post("/notion", dependencies=[Depends(_rate_limit)])
async def export(req: NotionRequest, _: str = Depends(_device)) -> dict[str, str]:
    s = get_settings()
    if not (s.notion_token and s.notion_parent_page_id):
        raise ApiError(501, "notion_off", "Notion is not connected on this server")
    body = {"parent": {"page_id": s.notion_parent_page_id},
            "properties": {"title": {"title": [{"text": {"content": req.title}}]}},
            "children": md_to_blocks(req.markdown)}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post("https://api.notion.com/v1/pages", json=body,
                         headers={"Authorization": f"Bearer {s.notion_token}", "Notion-Version": "2022-06-28"})
    if r.status_code != 200:
        raise ApiError(502, "notion_failed", "Notion refused the page (is the page shared with the integration?)")
    return {"url": str(r.json().get("url", ""))}
