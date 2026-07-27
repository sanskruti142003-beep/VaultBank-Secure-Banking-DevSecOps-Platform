#!/bin/sh
set -eu

nginx -t
nginx -s reload

echo "Nginx configuration reloaded successfully."
