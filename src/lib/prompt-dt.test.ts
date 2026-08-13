import { describe, it, expect } from "vitest";
import { SYSTEM_DT } from "./prompt-dt";
import { SECTORES } from "./sectores";

describe("SYSTEM_DT", () => {
  it("nombra los 9 sectores, para que el modelo no invente casillas", () => {
    // Guarda contra el drift: si mañana se agrega un sector y el prompt no se
    // actualiza, el modelo nunca lo va a usar y nadie se va a dar cuenta.
    for (const s of SECTORES) expect(SYSTEM_DT).toContain(s);
  });

  it("le dice al modelo que un cero en goles es un cero real", () => {
    // Es la corrección clave: como hay tabla de goleadores, el que no declara
    // es porque no hizo nada, no porque falte el dato.
    expect(SYSTEM_DT).toMatch(/todos declaran/i);
  });

  it("pide la explicación en chileno informal", () => {
    expect(SYSTEM_DT).toMatch(/informal/i);
  });

  it("limita las analogías a una por equipo, para que no cansen", () => {
    expect(SYSTEM_DT).toMatch(/como máximo una por\s+equipo/i);
  });

  it("deja claro que la lista de jugadores es un ejemplo, no un catálogo cerrado", () => {
    // Sin esto el modelo se queda pegado en los mismos diez nombres y a la
    // tercera semana la gracia ya se gastó.
    expect(SYSTEM_DT).toMatch(/no un catálogo/i);
    expect(SYSTEM_DT).toMatch(/Sal de esa lista/i);
  });
});
