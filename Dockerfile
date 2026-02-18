# MkDocs docs server — used by /lore-serve-docs-docker
# Serves the knowledge base at http://localhost:8000 with live reload
FROM python:3.12-slim
RUN pip install --no-cache-dir mkdocs mkdocs-material pymdown-extensions
WORKDIR /docs
EXPOSE 8000
ENTRYPOINT ["mkdocs"]
CMD ["serve", "--dev-addr=0.0.0.0:8000", "--livereload"]
