import React, { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { Line, Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

export default function App() {
  const [lat, setLat] = useState(37.7749);
  const [lon, setLon] = useState(-122.4194);
  const [selectedDate, setSelectedDate] = useState("07-15"); // MM-DD
  const [parameter, setParameter] = useState("T2M_MAX");
  const [threshold, setThreshold] = useState(30); // units depend on parameter
  const [yearsRange, setYearsRange] = useState({ start: 1980, end: 2023 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [csvUrl, setCsvUrl] = useState(null);

  function LocationMarker() {
    useMapEvents({
      click(e) {
        setLat(e.latlng.lat);
        setLon(e.latlng.lng);
      },
    });
    return <Marker position={[lat, lon]} />;
  }

  function buildPowerDailyUrl(lat, lon, startYear, endYear, parameters) {
    const start = `${startYear}0101`;
    const end = `${endYear}1231`;
    const params = parameters.join(",");
    return `https://power.larc.nasa.gov/api/temporal/daily/point?start=${start}&end=${end}&latitude=${lat}&longitude=${lon}&parameters=${params}&community=AG&format=JSON`;
  }

  async function fetchAndAnalyze() {
    setLoading(true);
    setResult(null);
    setCsvUrl(null);

    try {
      const paramMap = {
        T2M_MAX: "T2M_MAX",
        T2M_MIN: "T2M_MIN",
        T2M: "T2M",
        PRECTOT: "PRECTOT",
        WS2M: "WS2M",
      };
      const powerParams = [paramMap[parameter]];
      const url = buildPowerDailyUrl(lat, lon, yearsRange.start, yearsRange.end, powerParams);

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`POWER API error: ${resp.status}`);
      const payload = await resp.json();

      const series = payload.properties.parameter[powerParams[0]];
      const [mm, dd] = selectedDate.split("-");

      const rows = [];
      for (let y = yearsRange.start; y <= yearsRange.end; y++) {
        const key = `${y}${mm}${dd}`;
        const val = series[key];
        if (val === null || val === undefined) continue;
        rows.push({ year: y, date: `${y}-${mm}-${dd}`, value: val });
      }

      if (rows.length === 0) {
        setResult({ message: "No data for that day/range at this location." });
        setLoading(false);
        return;
      }

      const exceedCount = rows.filter((r) => r.value > threshold).length;
      const prob = (exceedCount / rows.length) * 100;
      const values = rows.map((r) => r.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      setResult({
        location: { lat, lon },
        parameter: powerParams[0],
        dayOfYear: `${mm}-${dd}`,
        years: { start: yearsRange.start, end: yearsRange.end },
        sampleSize: rows.length,
        mean,
        median,
        probExceedPercent: prob,
        rows,
      });

      const csvLines = ["year,date,value"];
      for (const r of rows) csvLines.push(`${r.year},${r.date},${r.value}`);
      const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
      const csvObjectUrl = URL.createObjectURL(blob);
      setCsvUrl(csvObjectUrl);
    } catch (err) {
      setResult({ message: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Weather Odds Dashboard (NASA POWER demo)</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="mb-2">Click map to drop pin (or move marker)</div>
          <div style={{ height: 360 }} className="rounded shadow overflow-hidden">
            <MapContainer center={[lat, lon]} zoom={6} style={{ height: "100%" }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationMarker />
            </MapContainer>
          </div>
          <div className="mt-2 text-sm text-gray-600">Lat: {lat.toFixed(4)} Lon: {lon.toFixed(4)}</div>
        </div>

        <div>
          <label className="block">Date (MM-DD):</label>
          <input value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-32 p-1 border rounded" />

          <label className="block mt-2">Parameter:</label>
          <select value={parameter} onChange={(e) => setParameter(e.target.value)} className="p-1 border rounded w-full">
            <option value="T2M_MAX">Daily Max Temp (°C)</option>
            <option value="T2M_MIN">Daily Min Temp (°C)</option>
            <option value="T2M">Daily Mean Temp (°C)</option>
            <option value="PRECTOT">Precipitation (mm/day)</option>
            <option value="WS2M">Wind Speed (m/s)</option>
          </select>

          <label className="block mt-2">Threshold (units depend on param):</label>
          <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="p-1 border rounded w-32" />

          <label className="block mt-2">Years range:</label>
          <div className="flex gap-2 items-center">
            <input type="number" value={yearsRange.start} onChange={(e) => setYearsRange({ ...yearsRange, start: Number(e.target.value) })} className="p-1 border rounded w-24" />
            <span>to</span>
            <input type="number" value={yearsRange.end} onChange={(e) => setYearsRange({ ...yearsRange, end: Number(e.target.value) })} className="p-1 border rounded w-24" />
          </div>

          <button onClick={fetchAndAnalyze} disabled={loading} className="mt-4 px-4 py-2 rounded bg-blue-600 text-white">
            {loading ? "Working..." : "Compute Odds"}
          </button>

          {result && (
            <div className="mt-4 p-3 border rounded bg-gray-50">
              {result.message ? (
                <div>{result.message}</div>
              ) : (
                <>
                  <div><strong>Sample size:</strong> {result.sampleSize} years</div>
                  <div><strong>Mean:</strong> {result.mean.toFixed(2)}</div>
                  <div><strong>Median:</strong> {result.median.toFixed(2)}</div>
                  <div><strong>Probability exceeding {threshold}:</strong> {result.probExceedPercent.toFixed(1)}%</div>
                  {csvUrl && (
                    <div className="mt-2">
                      <a href={csvUrl} download={`weather_rows_${parameter}_${selectedDate}.csv`} className="underline text-sm">Download CSV of the yearly samples</a>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Line chart */}
          {result && !result.message && (
            <div className="mt-6">
              <h2 className="font-semibold mb-2">Time Series of {result.parameter} ({selectedDate})</h2>
              <Line
                data={{
                  labels: result.rows.map(r => r.year),
                  datasets: [
                    {
                      label: `${result.parameter} values`,
                      data: result.rows.map(r => r.value),
                      borderColor: 'rgb(59, 130, 246)',
                      backgroundColor: 'rgba(59, 130, 246, 0.3)',
                    },
                    {
                      label: `Threshold (${threshold})`,
                      data: Array(result.rows.length).fill(threshold),
                      borderColor: 'rgb(220, 38, 38)',
                      borderDash: [5,5],
                      fill: false,
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { position: 'top' }, title: { display: true, text: 'Historical values vs threshold' } },
                  scales: { y: { beginAtZero: false } }
                }}
              />
            </div>
          )}

          {/* Histogram */}
          {result && !result.message && (
            <div className="mt-6">
              <h2 className="font-semibold mb-2">Histogram: Exceeding Threshold Highlighted</h2>
              <Bar
                data={{
                  labels: result.rows.map(r => r.year),
                  datasets: [{
                    label: 'Value',
                    data: result.rows.map(r => r.value),
                    backgroundColor: result.rows.map(r => r.value > threshold ? 'rgb(220,38,38)' : 'rgb(59,130,246)')
                  }]
                }}
                options={{
                  plugins: { legend: { display: false } },
                  responsive: true,
                  title: { display: true, text: 'Yearly values (red=exceed threshold)' },
                }}
              />
            </div>
          )}

        </div>
      </div>

      <div className="mt-6 text-sm text-gray-600">
        <strong>Notes:</strong> This demo queries the NASA POWER REST API for a single point and computes historical probabilities from the returned daily time series.
      </div>
    </div>
  );
}
