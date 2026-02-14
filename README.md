# Travel Life

A comprehensive travel documentation application for tracking trips, locations, photos, transportation, lodging, and journal entries.

## Features

- **Trip Management**: Create and manage trips with multiple destinations, statuses (Dream, Planning, Planned, In Progress, Completed, Cancelled)
- **Location Tracking**: Add points of interest with custom categories, visit duration, and notes
- **Photo Management**: Upload photos or integrate with Immich, organize in albums, automatic geotagging
- **Transportation**: Track flights, trains, buses, ferries, car rentals, and more with booking details and real-time flight tracking
- **Lodging**: Manage accommodations with booking information and dates
- **Journal Entries**: Write trip-level or daily journals with mood and weather tracking
- **Places Visited Map**: Visualize all locations from completed trips on a global map
- **Weather Integration**: Fetch historical and forecast weather data
- **Search & Discovery**: Global search with advanced filtering, travel companions
- **Import/Export**: Export trips to XML and print-friendly reports

## Tech Stack

### Backend

- Node.js + Express + TypeScript
- PostgreSQL with PostGIS
- Prisma ORM
- JWT Authentication

### Frontend

- React + TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query (React Query)
- Zustand (State Management)
- Leaflet (OpenStreetMap)
- TipTap (Rich Text Editor)

### Infrastructure

- Docker Compose
- Self-hosted Nominatim (Geocoding)
- OpenWeatherMap API
- AviationStack API
- Immich Integration

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- npm or yarn

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "Travel-Life"
```

### 2. Set Up Environment Variables

#### Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your configuration:

- Update JWT secrets (required)
- Add API keys for OpenWeatherMap, AviationStack (optional)
- Add Immich instance URL and API key (optional)

#### Frontend

```bash
cd frontend
cp .env.example .env
```

The frontend `.env` defaults should work with Docker Compose.

### 3. Start with Docker Compose

```bash
docker-compose up -d
```

This will start:

- PostgreSQL database with PostGIS (port 5432)
- Backend API (port 5000)
- Frontend (port 3000)
- Nominatim geocoding service (port 8080)

**Note**: Nominatim may take 1-2 hours to fully initialize on first run as it downloads and processes map data.

### 4. Run Database Migrations

```bash
cd backend
docker exec -it travel-life-backend npx prisma migrate dev
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Health Check**: http://localhost:5000/health

## Local Development (Without Docker)

### Backend

1. Install dependencies:

```bash
cd backend
npm install
```

2. Set up PostgreSQL with PostGIS locally and update `DATABASE_URL` in `.env`

3. Run migrations:

```bash
npm run prisma:migrate
```

4. Generate Prisma Client:

```bash
npm run prisma:generate
```

5. Start development server:

```bash
npm run dev
```

Backend will run on http://localhost:5000

### Frontend

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Start development server:

```bash
npm run dev
```

Frontend will run on http://localhost:3000

## Project Structure

```
Travel-Life/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── src/
│   │   ├── config/                # Configuration files
│   │   ├── controllers/           # Route controllers
│   │   ├── middleware/            # Express middleware
│   │   ├── routes/                # API routes
│   │   ├── services/              # Business logic
│   │   ├── types/                 # TypeScript types
│   │   └── utils/                 # Utility functions
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/            # React components
│   │   ├── pages/                 # Page components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── services/              # API services
│   │   ├── store/                 # State management
│   │   ├── types/                 # TypeScript types
│   │   └── utils/                 # Utility functions
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── PLANNING.md                    # Detailed planning document
└── README.md
```

## Available Scripts

### Backend

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (database GUI)
- `npm test` - Run tests

### Frontend

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Lint code

## API Documentation

Once the backend is running, API documentation will be available at:

- Swagger UI: http://localhost:5000/api-docs (TODO)

## Database Management

### Prisma Studio

To manage your database visually:

```bash
cd backend
npm run prisma:studio
```

This opens a web interface at http://localhost:5555

### Create a New Migration

```bash
cd backend
npx prisma migrate dev --name <migration_name>
```

### Reset Database

**Warning**: This will delete all data!

```bash
cd backend
npx prisma migrate reset
```

## External Service Configuration

### Immich Integration

1. Set up your Immich instance
2. Generate an API key in Immich settings
3. Add to `backend/.env`:

```
IMMICH_API_URL=http://your-immich-instance/api
IMMICH_API_KEY=your-api-key
```

### OpenWeatherMap

1. Sign up at https://openweathermap.org/
2. Get your free API key
3. Add to `backend/.env`:

```
OPENWEATHERMAP_API_KEY=your-api-key
```

### AviationStack

1. Sign up at https://aviationstack.com/
2. Get your API key
3. Add to `backend/.env`:

```
AVIATIONSTACK_API_KEY=your-api-key
```

### OpenRouteService (Recommended)

**Important**: For accurate road distance calculations for car, bicycle, and walking transportation, configure OpenRouteService:

1. Sign up at https://openrouteservice.org/dev/#/signup (free tier: 2,000 requests/day)
2. Get your API key
3. Add to root `.env` file:

```
OPENROUTESERVICE_API_KEY=your-api-key
```

4. Restart backend: `docker-compose restart backend`

**Without this configuration**, distances will fall back to straight-line calculations which are significantly less accurate for road-based travel.

See [ROUTING_SETUP.md](ROUTING_SETUP.md) for detailed setup instructions and troubleshooting.

## Nominatim Configuration

The default Docker Compose setup downloads US map data. To change the region:

Edit `docker-compose.yml` and update the `nominatim` service:

```yaml
environment:
  PBF_URL: https://download.geofabrik.de/europe/germany-latest.osm.pbf
  REPLICATION_URL: https://download.geofabrik.de/europe/germany-updates/
```

Find available regions at https://download.geofabrik.de/

## Troubleshooting

### Database Connection Issues

Ensure PostgreSQL container is healthy:

```bash
docker ps
```

Check logs:

```bash
docker logs travel-life-db
```

### Prisma Client Not Generated

```bash
cd backend
npx prisma generate
```

### Port Already in Use

Change ports in `docker-compose.yml`:

```yaml
ports:
  - "5001:5000"  # Backend on 5001
  - "3001:3000"  # Frontend on 3001
```

### Nominatim Not Responding

Nominatim takes time to initialize. Check progress:

```bash
docker logs travel-life-nominatim
```

## Production Deployment

### Build Production Images

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables

Ensure all secrets are properly set in production:

- Strong JWT secrets
- Secure database credentials
- Valid API keys

### Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT secrets
- [ ] Enable HTTPS
- [ ] Configure CORS for production domain
- [ ] Set up database backups
- [ ] Configure rate limiting
- [ ] Review file upload security
- [ ] Enable logging and monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

For detailed planning and architecture documentation, see [PLANNING.md](PLANNING.md)

For issues and feature requests, please use the GitHub issue tracker.
