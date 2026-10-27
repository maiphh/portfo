/** Step ranges for the plate state engine: "0-", "1-3", "2,4" (shared by the build and the browser). */
export const inR = (s: number, rs: string) =>
  String(rs)
    .split(",")
    .some((r) => {
      if (!r) return false;
      const [a = "", b] = r.split("-");
      const lo = +a;
      const hi = b === undefined ? lo : b === "" ? 1e9 : +b;
      return s >= lo && s <= hi;
    });
