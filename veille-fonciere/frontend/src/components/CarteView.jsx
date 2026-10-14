import { useEffect } from "react";
import { CircleMarker, LayersControl, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { PALIERS, couleurScore, euros, m2, TYPOS } from "../lib.js";

const IGN = (layer, fmt = "image/png", style = "normal") =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=${style}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${fmt}`;

function Recentrer({ sel }) {
  const map = useMap();
  useEffect(() => {
    if (sel?.lat != null) map.flyTo([sel.lat, sel.lon], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function CarteView({ annonces, selId, onSelect }) {
  const pts = annonces.filter((a) => a.lat != null);
  const sel = pts.find((a) => a.id === selId);
  // Les meilleurs scores sont dessinés en dernier (au-dessus)
  const ordre = [...pts].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return (
    <div className="relative h-full">
      <MapContainer center={[47.1, -0.9]} zoom={8} scrollWheelZoom preferCanvas>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Plan OpenStreetMap">
            <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Plan IGN">
            <TileLayer attribution="© IGN" url={IGN("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2")} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Photo aérienne IGN">
            <TileLayer attribution="© IGN" url={IGN("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg")} maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay name="Cadastre (zoom ≥ 15)">
            <TileLayer attribution="© IGN / DGFiP" url={IGN("CADASTRALPARCELS.PARCELLAIRE_EXPRESS", "image/png", "PCI vecteur")} minZoom={14} />
          </LayersControl.Overlay>
        </LayersControl>
        {ordre.map((a) => {
          const approx = a.precision_geo === "commune";
          const actif = a.id === selId;
          return (
            <CircleMarker key={a.id} center={[a.lat, a.lon]} radius={actif ? 11 : 7}
              pathOptions={{ color: actif ? "#f59e0b" : "#ffffff", weight: actif ? 3 : 2, fillColor: couleurScore(a.score),
                fillOpacity: approx ? 0.45 : 0.95, dashArray: approx ? "3 3" : null }}
              eventHandlers={{ click: () => onSelect(a.id) }}>
              <Tooltip direction="top" offset={[0, -6]}>
                <div className="text-xs">
                  <b>{a.commune}</b> · score {a.score ?? "—"}<br />
                  {euros(a.prix)} · {m2(a.surface_m2)} · {TYPOS[a.typologie] || a.typologie}
                  {approx && <><br /><i>Position : centre de la commune</i></>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
        <Recentrer sel={sel} />
      </MapContainer>
      <div className="absolute left-3 bottom-6 z-[1000] rounded-md bg-white/95 dark:bg-stone-900/95 shadow px-3 py-2 text-xs space-y-1">
        <div className="font-semibold">Score d'opportunité</div>
        {PALIERS.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full ring-2 ring-white dark:ring-stone-900" style={{ background: p.couleur }} />{p.label}
          </div>
        ))}
        <div className="flex items-center gap-2 text-stone-500">
          <span className="inline-block w-3 h-3 rounded-full border border-dashed border-stone-500" />Position approximative
        </div>
        <div className="text-stone-500">{pts.length} / {annonces.length} localisés</div>
      </div>
    </div>
  );
}
