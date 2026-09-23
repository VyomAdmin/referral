#!/bin/sh
set -e
npm run db:migrate
# Temporary: QA-data cleanup. No-ops unless CLEANUP_TEST_DATA is set, and
# always exits 0 so it can never stop the service booting. Remove this line
# (and the vars in apprunner.yaml) once the cleanup is confirmed.
npm run cleanup:test-data
exec npm start
