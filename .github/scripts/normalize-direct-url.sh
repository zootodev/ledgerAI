#!/usr/bin/env bash
# Shared DIRECT_URL cleanup for the database backup workflow.
#
# Source this file and call normalize_direct_url. It reads DIRECT_URL_RAW,
# validates it, and exports DIRECT_URL for the calling step. The URL and its
# components are never printed.

normalize_direct_url() {
  local url="${DIRECT_URL_RAW:-}"

  # Trim leading/trailing spaces and newlines.
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"

  # Remove one pair of wrapping quotes, if present.
  case "$url" in
    \"*\") url="${url#\"}"; url="${url%\"}" ;;
    \'*\') url="${url#\'}"; url="${url%\'}" ;;
  esac
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"

  # Accept a pasted DIRECT_URL= prefix. Strip quotes again so a value pasted as
  # DIRECT_URL="postgresql://..." is cleaned by the same helper.
  case "$url" in
    DIRECT_URL=*) url="${url#DIRECT_URL=}" ;;
  esac
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"
  case "$url" in
    \"*\") url="${url#\"}"; url="${url%\"}" ;;
    \'*\') url="${url#\'}"; url="${url%\'}" ;;
  esac
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"

  case "$url" in
    postgres://*|postgresql://*) ;;
    *)
      printf '%s\n' '::error::DIRECT_URL is not a postgresql:// URL. Re-paste it without quotes. See docs/BACKUPS.md.' >&2
      return 1
      ;;
  esac

  # Inspect the authority without printing it. The transaction pooler uses
  # port 6543 and cannot support pg_dump's session-level operations.
  local authority="${url#*://}"
  authority="${authority%%[/?]*}"
  local hostport="${authority##*@}"
  local port="${hostport##*:}"
  if [ "$port" = "6543" ]; then
    printf '%s\n' '::error::DIRECT_URL points at the transaction pooler (6543). Backups need the session pooler (5432) or the direct connection.' >&2
    return 1
  fi

  case "$url" in
    *sslmode=*) ;;
    *\?*) url="${url}&sslmode=require" ;;
    *) url="${url}?sslmode=require" ;;
  esac

  DIRECT_URL="$url"
  export DIRECT_URL
}
