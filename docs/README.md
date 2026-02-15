# Travel Life Documentation

Welcome to the Travel Life documentation. This guide will help you navigate the available documentation resources.

## Quick Links

| Need | Document |
|------|----------|
| **Get started quickly** | [Quick Start Production](../QUICK_START_PRODUCTION.md) |
| **Deploy to production** | [Deployment Guide](../DEPLOYMENT.md) |
| **Understand the codebase** | [Backend Architecture](architecture/BACKEND_ARCHITECTURE.md) |
| **Work on the UI** | [Style Guide](architecture/STYLE_GUIDE.md) |
| **Release a new version** | [Release Checklist](../RELEASE_CHECKLIST.md) |
| **Track project progress** | [Implementation Status](development/IMPLEMENTATION_STATUS.md) |

## Documentation Structure

```
docs/
├── README.md                 # You are here
├── architecture/             # Technical architecture documentation
│   ├── BACKEND_ARCHITECTURE.md
│   ├── FRONTEND_ARCHITECTURE.md
│   ├── STYLE_GUIDE.md
│   ├── BACKEND_OPTIMIZATION_PLAN.md
│   └── DATABASE_SCHEMA.md    # Database design and relationships
├── development/              # Development tracking
│   ├── IMPLEMENTATION_STATUS.md
│   ├── FEATURE_BACKLOG.md
│   ├── BUGS.md
│   └── UI_UX_IMPROVEMENT_PLAN.md
├── guides/                   # How-to guides
│   ├── BUILD_AND_PUSH.md
│   ├── DEVELOPMENT_WORKFLOWS.md
│   ├── DEBUGGING_AND_OPTIMIZATION.md
│   ├── HTTPS_SETUP.md
│   ├── TESTING_GUIDE.md
│   └── ROUTING_SETUP.md
├── plans/                    # Future planning documents
│   ├── GOOGLE_MAPS_INTEGRATION_PLAN.md
│   ├── GOOGLE_PHOTOS_INTEGRATION_PLAN.md
│   └── UI_IMPROVEMENTS.md
└── user-guide/               # End-user documentation
    └── README.md
```

## Documentation by Role

### For Developers

Start with architecture documentation to understand the codebase:

1. **[Backend Architecture](architecture/BACKEND_ARCHITECTURE.md)** - Server-side patterns, services, database access
2. **[Frontend Architecture](architecture/FRONTEND_ARCHITECTURE.md)** - React components, state management, hooks
3. **[Style Guide](architecture/STYLE_GUIDE.md)** - UI component patterns, colors, typography

Then review development processes:

1. **[Development Workflows](guides/DEVELOPMENT_WORKFLOWS.md)** - Step-by-step guides for working with each feature
1. **[Debugging & Optimization](guides/DEBUGGING_AND_OPTIMIZATION.md)** - Agent-based debugging and code optimization
1. **[Build and Push Guide](guides/BUILD_AND_PUSH.md)** - How to build and release
1. **[Testing Guide](guides/TESTING_GUIDE.md)** - Testing strategy and patterns

### For DevOps / System Administrators

1. **[Quick Start Production](../QUICK_START_PRODUCTION.md)** - Fast deployment guide
2. **[Deployment Guide](../DEPLOYMENT.md)** - Comprehensive deployment documentation
3. **[HTTPS Setup](guides/HTTPS_SETUP.md)** - TLS/HTTPS configuration with Let's Encrypt or Traefik
4. **[Release Checklist](../RELEASE_CHECKLIST.md)** - Release procedures

### For Project Managers / Contributors

1. **[Implementation Status](development/IMPLEMENTATION_STATUS.md)** - Current project state
2. **[Feature Backlog](development/FEATURE_BACKLOG.md)** - Planned features
3. **[Known Bugs](development/BUGS.md)** - Issue tracking

### For End Users

1. **[User Guide](user-guide/README.md)** - How to use the application

## Key Concepts

### Application Name

- **Travel Life** - The application name used across UI, branding, and technical infrastructure

See [CLAUDE.md](../CLAUDE.md) for full naming convention details.

### Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Database   │
│   (React)   │     │  (Express)  │     │ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Nominatim│ │  Immich  │ │ External │
        │(Geocoding│ │ (Photos) │ │   APIs   │
        └──────────┘ └──────────┘ └──────────┘
```

### Core Features

| Feature | Status | Documentation |
|---------|--------|---------------|
| Trip Management | Complete | Backend/Frontend Architecture |
| Photo Management | Complete | Backend Architecture |
| Transportation | Complete | Backend Architecture |
| Lodging | Complete | Backend Architecture |
| Timeline View | Complete | Frontend Architecture |
| Entity Linking | Complete | Backend Architecture |
| Collaboration | In Progress | Implementation Status |

## External Dependencies

| Service | Purpose | Setup Guide |
|---------|---------|-------------|
| Nominatim | Geocoding | [Deployment Guide](../DEPLOYMENT.md) |
| Immich | Photo library | [Backend Architecture](architecture/BACKEND_ARCHITECTURE.md) |
| OpenRouteService | Road distances | [Routing Setup](guides/ROUTING_SETUP.md) |
| OpenWeatherMap | Weather data | [README](../README.md) |
| AviationStack | Flight tracking | [README](../README.md) |

## Getting Help

- **Claude Code users**: Read [CLAUDE.md](../CLAUDE.md) for AI assistant guidance
- **Bug reports**: Check [BUGS.md](development/BUGS.md) first
- **Feature requests**: See [Feature Backlog](development/FEATURE_BACKLOG.md)
- **GitHub Issues**: For unresolved problems

## Contributing to Documentation

When updating documentation:

1. Keep content accurate and up-to-date
2. Use markdown formatting consistently
3. Add blank lines around code blocks and headings
4. Update this index when adding new documents
5. Cross-reference related documents

See the Markdown Formatting Guidelines in [CLAUDE.md](../CLAUDE.md) for style rules.
