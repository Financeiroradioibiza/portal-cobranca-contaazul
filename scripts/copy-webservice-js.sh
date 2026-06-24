#!/bin/sh
# Copia rotas webservice em JS puro para dist/ após `tsc` (tsconfig só compila .ts).
set -eu

APP="$(cd "${1:-.}" && pwd)"

if [[ ! -d "$APP/src/routes/webservice" ]]; then
  echo "Erro: $APP/src/routes/webservice não encontrado" >&2
  exit 1
fi

mkdir -p "$APP/dist/routes/webservice"
cp "$APP/src/routes/loginByToken.js" "$APP/dist/routes/loginByToken.js"
cp "$APP/src/routes/webservice/"*.js "$APP/dist/routes/webservice/"

echo "OK — JS webservice copiado para $APP/dist"
