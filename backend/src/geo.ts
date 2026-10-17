interface IpApiResponse {
  status: "success" | "fail";
  city?: string;
  regionName?: string;
  country?: string;
}

// Free ip-api.com lookup (no key, rate-limited, HTTP only). Good enough for a demo.
export async function lookupLocation(ip: string): Promise<string> {
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = (await res.json()) as IpApiResponse;
    if (data.status !== "success") return "an unknown location";
    return [data.city, data.regionName, data.country].filter(Boolean).join(", ");
  } catch {
    return "an unknown location";
  }
}
