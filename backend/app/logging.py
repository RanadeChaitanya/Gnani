"""JSON logging with a redaction filter (keys, JWTs, tokens in query strings)."""
import json
import logging
import re

_PATTERNS = [
    (re.compile(r"eyJ[\w-]+\.[\w-]+\.[\w-]+"), "[jwt]"),
    (re.compile(r"(token=)[^&\s\"']+"), r"\1[redacted]"),
    (re.compile(r"(x-api-key-id['\"]?\s*[:=]\s*['\"]?)[^'\"\s,}]+", re.I), r"\1[redacted]"),
    (re.compile(r"(Bearer\s+)\S+", re.I), r"\1[redacted]"),
    # uvicorn.error prints "ip:port - "WebSocket …" [accepted]": never keep client IPs
    (re.compile(r"^\S+:\d+ - \""), "[client] - \""),
    (re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b"), "[ip]"),
]


def redact(text: str) -> str:
    for pat, repl in _PATTERNS:
        text = pat.sub(repl, text)
    return text


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {"t": self.formatTime(record), "lvl": record.levelname, "log": record.name,
               "msg": redact(record.getMessage())}
        extra = getattr(record, "data", None)
        if extra:
            out["data"] = json.loads(redact(json.dumps(extra, default=str)))
        if record.exc_info:
            out["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(out, ensure_ascii=False)


def setup_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # uvicorn access logs include query strings; route them through our redacting formatter
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers[:] = []
        lg.propagate = True
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # access lines carry client IPs: never log them
    logging.getLogger("httpx").setLevel(logging.WARNING)
