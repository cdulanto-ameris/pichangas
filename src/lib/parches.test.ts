import { describe, it, expect } from "vitest";
import { normalizarNombre, coincideBusqueda } from "./parches";

describe("normalizarNombre", () => {
  it("recorta espacios y colapsa los internos", () => {
    expect(normalizarNombre("  Juan   Pablo  ")).toBe("juan pablo");
  });

  it("pasa a minúsculas", () => {
    expect(normalizarNombre("GATO")).toBe("gato");
  });

  it("elimina acentos y diéresis", () => {
    expect(normalizarNombre("Nacho")).toBe("nacho");
    expect(normalizarNombre("Pingüino")).toBe("pinguino");
    expect(normalizarNombre("José")).toBe("jose");
  });

  it("trata como iguales dos escrituras del mismo nombre", () => {
    expect(normalizarNombre(" el Pato ")).toBe(normalizarNombre("El  Pato"));
    expect(normalizarNombre("Peñi")).toBe(normalizarNombre("peni"));
  });
});

describe("coincideBusqueda", () => {
  it("coincide con término vacío (muestra todos)", () => {
    expect(coincideBusqueda("Juan", "")).toBe(true);
    expect(coincideBusqueda("Juan", "   ")).toBe(true);
  });

  it("coincide por prefijo y por substring, sin distinguir mayúsculas/acentos", () => {
    expect(coincideBusqueda("Juan", "ju")).toBe(true);
    expect(coincideBusqueda("Nacho", "ach")).toBe(true);
    expect(coincideBusqueda("José", "jose")).toBe(true);
  });

  it("no coincide cuando el término no está contenido", () => {
    expect(coincideBusqueda("Juan", "xyz")).toBe(false);
    expect(coincideBusqueda("Pedro", "juan")).toBe(false);
  });
});
