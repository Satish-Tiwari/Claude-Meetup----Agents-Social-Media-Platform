import * as os from 'os';

export interface ShareLinks {
  /** Non-internal IPv4 addresses of this machine, most likely LAN first. */
  addresses: string[];
  /** The address to put on a slide: first private-range IPv4, else first found. */
  primaryAddress: string | null;
  httpPort: number;
  httpsPort: number;
  /** Ready-to-share URLs built on the primary address (null when offline). */
  primary: { app: string; observatory: string; mobile: string } | null;
  /** The same three URLs for every address, so the caller can pick. */
  all: { address: string; app: string; observatory: string; mobile: string }[];
}

function isPrivate(ip: string): boolean {
  return (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

/** Non-internal IPv4 addresses, private LAN ranges first, Docker bridges last. */
export function lanAddresses(): string[] {
  const all = Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (iface): iface is os.NetworkInterfaceInfo =>
        !!iface && iface.family === 'IPv4' && !iface.internal,
    )
    .map((iface) => iface.address);

  // A 172.x Docker bridge is technically private but useless to share; sort it after real LAN ranges.
  const score = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : isPrivate(ip) ? 2 : 3);
  return Array.from(new Set(all)).sort((a, b) => score(a) - score(b));
}

/**
 * Links a person can open from another device on the same network. Built at
 * request time so a laptop that changes Wi-Fi does not need a restart.
 */
export function buildShareLinks(httpPort: number, httpsPort: number): ShareLinks {
  const addresses = lanAddresses();
  const primaryAddress = addresses[0] ?? null;

  const forAddress = (address: string) => ({
    address,
    app: `http://${address}:${httpPort}`,
    observatory: `http://${address}:${httpPort}/observatory`,
    mobile: `https://${address}:${httpsPort}`,
  });

  return {
    addresses,
    primaryAddress,
    httpPort,
    httpsPort,
    primary: primaryAddress ? (({ address: _a, ...rest }) => rest)(forAddress(primaryAddress)) : null,
    all: addresses.map(forAddress),
  };
}
