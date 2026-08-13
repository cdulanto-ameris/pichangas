import { describe, it, expect } from "vitest";
import { decidirArmado, type ArmadoActual } from "./armado-dt-decision";

const DIECISEIS = Array.from({ length: 16 }, (_, i) => `j${i}`);
const OTRA_SELECCION = [...DIECISEIS.slice(0, 15), "j99"];
const listo = (ids: string[]): ArmadoActual => ({ estado: "listo", jugadores_ids: ids });

describe("decidirArmado", () => {
  it("manda esperar si ya hay uno corriendo", () => {
    expect(decidirArmado({ estado: "en_proceso" }, DIECISEIS, false)).toBe("esperar");
  });

  it("sigue mandando esperar aunque vengan forzando, para no pagar dos veces la misma tanda", () => {
    // Forzar existe para gastar a propósito sobre un armado YA terminado, no
    // para encolar un segundo encima de uno en vuelo.
    expect(decidirArmado({ estado: "en_proceso" }, DIECISEIS, true)).toBe("esperar");
  });

  it("arranca cuando no hay ningún armado previo", () => {
    expect(decidirArmado(null, DIECISEIS, false)).toBe("arrancar");
  });

  it("pide confirmación si ya hay equipos para esta misma selección", () => {
    expect(decidirArmado(listo(DIECISEIS), DIECISEIS, false)).toBe("confirmar");
  });

  it("compara la selección como conjunto, no por el orden en que se eligió", () => {
    expect(decidirArmado(listo(DIECISEIS), [...DIECISEIS].reverse(), false)).toBe("confirmar");
  });

  it("arranca sin preguntar si cambió la selección, porque el armado viejo ya no aplica", () => {
    expect(decidirArmado(listo(DIECISEIS), OTRA_SELECCION, false)).toBe("arrancar");
  });

  it("arranca cuando el admin ya confirmó que quiere gastar de nuevo", () => {
    expect(decidirArmado(listo(DIECISEIS), DIECISEIS, true)).toBe("arrancar");
  });

  it("arranca si el armado anterior quedó en error", () => {
    expect(decidirArmado({ estado: "error" }, DIECISEIS, false)).toBe("arrancar");
  });
});
