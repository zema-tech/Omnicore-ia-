# Omnicore su Hugging Face Spaces (SDK Docker). Il codice viene clonato da GitHub al build.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# HF esegue il container come utente 1000 (in node:22 è l'utente "node").
WORKDIR /home/node/app
ARG OMNICORE_REF=main
RUN git clone --depth 1 --branch ${OMNICORE_REF} https://github.com/zema-tech/Omnicore-ia-.git . \
  && chown -R node:node /home/node/app
USER node

# Dipendenze (solo typescript/@types; npm install perché il monorepo non ha lockfile in radice).
RUN npm install --no-audit --no-fund

WORKDIR /home/node/app/omnicore
# I submodule vendors/ non sono clonati: Omnicore usa i suoi moduli nativi.
ENV OMNICORE_HOST=0.0.0.0 \
    OMNICORE_PORT=7860 \
    OMNICORE_PROFILE=light
# OMNICORE_API_TOKEN e le chiavi LLM arrivano dai Secrets dello Space (a runtime).

EXPOSE 7860
CMD ["python3", "server.py"]
