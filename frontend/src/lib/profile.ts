// This phone's identity (name + mobile number, set up once) and the people it has called.
import { useEffect, useState } from "react";
import { api } from "./api";

export type Profile = { name: string; phone: string; lang: string; device_token: string };
export type Person = { name: string; phone: string };

const read = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "") as T;
  } catch {
    return d;
  }
};
export const getProfile = () => read<Profile | null>("saar:profile", null);
export const people = () => read<Person[]>("saar:people", []);

export async function saveProfile(name: string, phone: string, lang: string): Promise<Profile> {
  const r = await api<{ device_token: string; phone: string }>("/api/me", { body: { phone } });
  const p = { name: name.trim(), phone: r.phone, lang, device_token: r.device_token };
  localStorage.setItem("saar:profile", JSON.stringify(p));
  return p;
}

export function rememberPerson(p: Person): void {
  const digits = (x: string) => x.replace(/\D/g, "").slice(-10);
  const rest = people().filter((x) => digits(x.phone) !== digits(p.phone));
  localStorage.setItem("saar:people", JSON.stringify([p, ...rest].slice(0, 8)));
}

/** Android Chrome's contact picker; null where the browser has none (then the user types the number). */
type ContactsApi = { select: (props: string[], o: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };
export const canPickContact = () => "contacts" in navigator && "ContactsManager" in window;
export async function pickContact(): Promise<Person | null> {
  const [c] = await (navigator as unknown as { contacts: ContactsApi }).contacts.select(["name", "tel"], { multiple: false });
  return c?.tel?.[0] ? { name: c.name?.[0] ?? c.tel[0], phone: c.tel[0] } : null;
}

export type Incoming = { room_code: string; from_name: string };

/** Keeps this phone reachable while Saar is open; returns the call ringing right now, if any. */
export function useIncomingCall(profile: Profile | null): [Incoming | null, () => void] {
  const [ring, setRing] = useState<Incoming | null>(null);
  useEffect(() => {
    if (!profile) return;
    let ws: WebSocket | null = null;
    let alive = true;
    let retry = 0;
    const open = () => {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/inbox`);
      ws.onopen = () => {
        retry = 0;
        ws!.send(JSON.stringify({ type: "auth", token: profile.device_token }));
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "incoming") setRing({ room_code: m.room_code, from_name: m.from_name });
        else setRing((r) => (r?.room_code === m.room_code ? null : r)); // answered elsewhere / cancelled
      };
      ws.onclose = () => alive && setTimeout(open, Math.min(15000, 1000 * 2 ** retry++));
    };
    open();
    const ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 20000);
    return () => {
      alive = false;
      clearInterval(ping);
      ws?.close();
    };
  }, [profile]);
  return [ring, () => setRing(null)];
}
