#!/bin/sh
set -e
npm run db:migrate
exec npm start
