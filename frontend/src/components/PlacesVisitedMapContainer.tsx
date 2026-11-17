import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import PlacesVisitedMap from "./PlacesVisitedMap";
import MapTouchGuard from "./map/MapTouchGuard";
import type { Location } from "../types/location";
import type { Transportation } from "../types/transportation";
import { useMapTiles } from "../hooks/useMapTiles";
import {
    SINGLE_PLACE_ZOOM,
    isSinglePoint,
    pointsSignature,
    validCoordinates,
} from "../utils/placesBounds";

interface PlacesVisitedMapContainerProps {
    locations: Location[];
    transportation: Transportation[];
}

/** Leaflet measures its box once; re-measure when the box is resized. */
function InvalidateOnResize() {
    const map = useMap();
    useEffect(() => {
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(map.getContainer());
        return () => observer.disconnect();
    }, [map]);
    return null;
}

/** Fits the view to the pins when the set of places changes, not on every render. */
function FitToLocations({ points }: { points: [number, number][] }) {
    const map = useMap();
    const signature = pointsSignature(points);

    useEffect(() => {
        if (points.length === 0) return;
        map.invalidateSize();
        if (isSinglePoint(points)) {
            map.setView(points[0], SINGLE_PLACE_ZOOM);
        } else {
            map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
        }
        // `points` is represented by `signature`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, map]);

    return null;
}

const PlacesVisitedMapContainer = ({ locations, transportation }: PlacesVisitedMapContainerProps) => {
    const tileConfig = useMapTiles();
    const points = useMemo(() => validCoordinates(locations), [locations]);

    return (
        <MapContainer
            center={points[0] ?? [20, 0]}
            zoom={points.length > 0 ? SINGLE_PLACE_ZOOM : 2}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
            className="z-0 [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!flex [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!h-11 [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!w-11 [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!items-center [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!justify-center [@media(pointer:coarse)]:[&_.leaflet-popup-close-button]:!h-11 [@media(pointer:coarse)]:[&_.leaflet-popup-close-button]:!w-11 [@media(pointer:coarse)]:[&_.leaflet-popup-close-button]:!text-2xl [@media(pointer:coarse)]:[&_.leaflet-popup-content_a]:inline-block [@media(pointer:coarse)]:[&_.leaflet-popup-content_a]:py-3"
        >
            <TileLayer
                key={tileConfig.url}
                url={tileConfig.url}
                attribution={tileConfig.attribution}
                maxZoom={tileConfig.maxZoom}
            />
            <InvalidateOnResize />
            <FitToLocations points={points} />
            <MapTouchGuard />
            <PlacesVisitedMap locations={locations} transportation={transportation} />
        </MapContainer>
    );
};

export default PlacesVisitedMapContainer;
