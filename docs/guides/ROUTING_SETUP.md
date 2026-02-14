# Routing Service Setup Guide

## Overview

Travel Life uses OpenRouteService to calculate accurate road distances for car, bicycle, and walking transportation. Without this configuration, the application will fall back to straight-line (Haversine) distance calculations, which are significantly less accurate for road-based travel.

## Why You Need This

**With OpenRouteService API:**
- San Francisco to Los Angeles: ~615 km (actual driving distance via highways)
- Accurate route-based distances for all car, bike, and walking trips
- Proper duration estimates based on road types and speed limits

**Without OpenRouteService API:**
- San Francisco to Los Angeles: ~559 km (straight line through terrain)
- Inaccurate distances that don't account for roads, terrain, or actual routes
- Distance calculations will be marked as "Haversine" (straight-line)

## Setup Instructions

### Step 1: Get a Free API Key

1. Go to [OpenRouteService Signup](https://openrouteservice.org/dev/#/signup)
2. Create a free account (takes 2 minutes)
3. Navigate to your dashboard
4. Click "Request a Token" or "API Key"
5. Copy your API key (it will look like: `5b3ce3597851110001cf6248abc123def456...`)

**Free Tier Limits:**
- 2,000 requests per day
- 40 requests per minute
- Sufficient for personal travel tracking use

### Step 2: Configure Your Installation

#### For Development (docker-compose.yml)

1. Open the `.env` file in the project root (or create it if it doesn't exist)
2. Add your API key:

```env
OPENROUTESERVICE_API_KEY=your-actual-api-key-here
```

3. Restart the backend container:

```bash
docker-compose restart backend
```

#### For Production (docker-compose.prod.yml)

1. Open your `.env.production` file (or create from `.env.production.example`)
2. Add your API key:

```env
OPENROUTESERVICE_API_KEY=your-actual-api-key-here
```

3. Restart your production services:

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.production restart backend
```

#### For TrueNAS Scale

1. Open your `.env` file (or create from `.env.truenas.example`)
2. Add your API key:

```env
OPENROUTESERVICE_API_KEY=your-actual-api-key-here
```

3. Restart the backend container:

```bash
docker-compose -f docker-compose.truenas.yml --env-file .env restart backend
```

Or if using the optimized version:

```bash
docker-compose -f docker-compose.truenas.optimized.yml --env-file .env restart backend
```

### Step 3: Verify It's Working

1. Check backend logs to confirm API key is loaded:

```bash
docker logs travel-life-backend | grep "Routing Service"
```

**Success indicators:**
- You should see: `[Routing Service] Calculated route distance for transportation X: Y km`
- You should NOT see: `[Routing Service] No API key configured, using Haversine formula`

2. Create a test transportation entry:
   - Create a new trip or open an existing one
   - Add a car transportation with two locations
   - The distance should calculate within a few seconds
   - Compare with Google Maps - should be similar

3. Check the distance source indicator:
   - In the Transportation Manager, look for route-based distance indicators
   - The `distanceSource` field will show 'route' instead of 'haversine'

### Step 4: Recalculate Existing Distances (Optional)

If you have existing transportation entries that were calculated using Haversine, you can recalculate them:

1. Open the application in your browser
2. Navigate to the Dashboard
3. Look for the Travel Statistics widget
4. Click the "Recalculate Distances" button
5. Wait for confirmation that distances have been recalculated

This will update all transportation entries with accurate route-based distances.

## How It Works

### Routing Profiles

The application automatically selects the appropriate routing profile based on transportation type:

| Transportation Type | Routing Profile | Description |
|---------------------|----------------|-------------|
| Car, Taxi, Uber, Ride-share | `driving-car` | Roads for motor vehicles, highway speeds |
| Bicycle, Bike | `cycling-regular` | Bike paths and roads suitable for cycling |
| Walk, Walking | `foot-walking` | Pedestrian paths and walkways |
| Other types | `driving-car` | Default fallback |

### Caching

To minimize API calls and improve performance:

- Route calculations are cached in the database for 30 days
- Cache matches routes within ~100 meters tolerance
- Subsequent trips on the same route use cached data
- No API calls needed for cached routes

### Fallback Behavior

If the OpenRouteService API is unavailable (network error, rate limit, invalid key):

- The system automatically falls back to Haversine distance calculation
- The application continues to work (with less accurate distances)
- Distance source is marked as 'haversine' in the database
- You can recalculate these entries later when API is available

## Troubleshooting

### "No API key configured" in logs

**Problem:** Backend logs show: `[Routing Service] No API key configured, using Haversine formula`

**Solution:**
1. Verify the API key is in your `.env` file
2. Ensure the `.env` file is in the correct location:
   - Development: `/path/to/travel-life/.env`
   - Production: `/path/to/travel-life/.env.production`
3. Restart the backend container: `docker-compose restart backend`
4. Check logs again: `docker logs travel-life-backend | tail -20`

### "Invalid OpenRouteService API key" error

**Problem:** Backend logs show: `OpenRouteService API error: Invalid API key`

**Solution:**
1. Verify you copied the complete API key (no extra spaces, complete string)
2. Check your OpenRouteService dashboard - is the key active?
3. Try generating a new API key
4. Update your `.env` file with the new key
5. Restart backend: `docker-compose restart backend`

### "Rate limit exceeded" error

**Problem:** Backend logs show: `OpenRouteService rate limit exceeded`

**Solution:**
1. Free tier has 2,000 requests/day and 40 requests/minute
2. If you're frequently hitting limits:
   - Check for loops or bugs causing excessive API calls
   - Consider upgrading to a paid tier
   - Use the cache more effectively (don't recreate identical routes)
3. The application will fall back to Haversine until limit resets

### Distances still showing as straight-line

**Problem:** New transportation entries still show straight-line distances

**Checklist:**
1. ✅ API key is configured in `.env` file
2. ✅ Backend container has been restarted after adding key
3. ✅ Backend logs show route calculations (not Haversine)
4. ✅ Transportation has both start and end locations with valid coordinates
5. ✅ Locations are routable (not in ocean, not too far apart)

If all checkboxes pass but still seeing issues:
- Clear route cache: `docker exec travel-life-backend npx prisma studio`
- Navigate to RouteCache table and delete all entries
- Try creating a new transportation entry

### How to check if API key is working

Run this command to see routing service activity:

```bash
# Watch logs in real-time
docker logs -f travel-life-backend | grep "Routing"

# Check recent routing activity
docker logs travel-life-backend --tail 100 | grep "Routing"
```

**Good output:**
```
[Routing Service] Calculated route distance for transportation 123: 615.42 km
[Routing Service] Using cached route
```

**Bad output:**
```
[Routing Service] No API key configured, using Haversine formula
[Routing Service] Failed to fetch route from API, falling back to Haversine
```

## Advanced: Self-Hosted OpenRouteService

If you prefer not to use the cloud API, you can self-host OpenRouteService:

**Pros:**
- No external API calls
- Unlimited requests
- More privacy

**Cons:**
- Requires significant disk space (10-50GB depending on region)
- Takes hours to build routing graphs initially
- Requires CPU resources for graph building
- More complex setup and maintenance

### Self-Hosted Setup (Brief Overview)

1. Add OpenRouteService container to your `docker-compose.yml`
2. Download map data (PBF file) for your region
3. Build routing graphs (takes 2-8 hours)
4. Configure backend to use local service:

```env
OPENROUTESERVICE_URL=http://openrouteservice:8080
# No API key needed for self-hosted
OPENROUTESERVICE_API_KEY=
```

**Note:** Self-hosted setup is only recommended for production deployments with specific privacy or scale requirements. For personal use, the free cloud API is simpler and sufficient.

## Additional Resources

- [OpenRouteService Documentation](https://openrouteservice.org/dev/#/api-docs)
- [OpenRouteService GitHub](https://github.com/GIScience/openrouteservice)
- [Self-Hosting Guide](https://github.com/GIScience/openrouteservice/wiki/Installation-and-Usage)

## Summary

1. **Get API key:** https://openrouteservice.org/dev/#/signup (2 minutes)
2. **Add to .env:** `OPENROUTESERVICE_API_KEY=your-key`
3. **Restart backend:** `docker-compose restart backend`
4. **Verify:** Check logs for successful route calculations
5. **Recalculate:** Use UI button to update existing transportation

With this setup, all car, bicycle, and walking transportation will calculate accurate road distances automatically!
