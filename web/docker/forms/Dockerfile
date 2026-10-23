FROM python:3.12-slim-bookworm
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && python -m playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
CMD ["python", "-m", "playwright", "run-server", "--host", "127.0.0.1", "--port", "9460"]
