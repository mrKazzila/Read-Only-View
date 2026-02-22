# =====================
# Settings
# =====================
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# =====================
# Imports
# =====================
import 'setup.just'
import 'development.just'
import 'build.just'
import 'test.just'
import 'quality.just'

# Local commands (do not commit)
import? 'local.just'
