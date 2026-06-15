import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HudHeader } from "@/components/HudHeader";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Inicio,
  head: () => ({
    meta: [
      { title: "Cómo funciona — Pichangas" },
      { name: "description", content: "Reglas y funcionamiento completo de Pichangas: tabla, goleadores, puntuación post-partido, posiciones y más." },
    ],
  }),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="hud-panel overflow-hidden">
      <div className="hud-header-bar px-4 py-2">
        <span className="hud-tab-title text-sm">{title}</span>
      </div>
      <div className="p-4 sm:p-5 text-sm leading-relaxed text-foreground/90 space-y-2">
        {children}
      </div>
    </section>
  );
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-accent font-bold min-w-[1.25rem]">{k}</span>
      <span>{children}</span>
    </div>
  );
}

function Inicio() {
  return (
    <div className="min-h-screen pb-12">
      <HudHeader />
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="hud-panel p-5 sm:p-6">
          <h1 className="text-chrome text-2xl sm:text-3xl font-extrabold tracking-wider">
            BIENVENIDO A PICHANGAS
          </h1>
          <p className="mt-2 text-foreground/80 text-sm sm:text-base">
            La app para organizar nuestras pichangas, armar equipos justos y llevar un registro
            de cada partido. Acá te explicamos <span className="text-accent font-bold">todo</span> el funcionamiento.
          </p>
        </div>

        <Section title="📊 LA TABLA DE POSICIONES">
          <p>
            La tabla principal premia <span className="text-accent font-bold">ir a jugar y ganar partidos</span>, no las estadísticas individuales.
          </p>
          <Item k="•"><b>PG</b> (partido ganado) = <span className="text-accent">3 puntos</span></Item>
          <Item k="•"><b>PP</b> (partido perdido) = <span className="text-accent">1 punto</span> por ir a jugar</Item>
          <Item k="•">No hay empates: si el partido termina igualado, se define con penales o gol de oro.</Item>
          <Item k="•"><b>PJ</b> = partidos jugados. Cuantos más juegues, más chances de sumar.</Item>
          <p className="text-foreground/70 italic pt-2">
            Los goles y asistencias <b>no</b> dan puntos en la tabla general. Sirven para los rankings individuales.
          </p>
        </Section>

        <Section title="⚽ GOLEADORES Y ASISTIDORES">
          <p>
            En las pestañas <b>Goleadores</b> y <b>Asistidores</b> de la tabla se acumulan los goles y asistencias por jugador.
          </p>
          <Item k="•">Los goles suman solo al <b>goleador</b>, no al equipo en la tabla general.</Item>
          <Item k="•">Las asistencias se llevan en su propio ranking aparte.</Item>
          <Item k="•">Cada uno carga sus propios goles y asistencias al cerrar el partido.</Item>
        </Section>

        <Section title="🧩 EL ARMADOR (cómo se arma un partido)">
          <p>Cualquiera con sesión puede entrar a <b>Armador</b> para crear el partido:</p>
          <Item k="1.">Eliges los jugadores que están presentes hoy.</Item>
          <Item k="2.">Modo <b>Auto</b>: el sistema arma equipos balanceados según el nivel.</Item>
          <Item k="3.">Modo <b>Manual</b>: el admin reparte los equipos a mano.</Item>
          <Item k="4."><b>🩹 Parches</b>: si falta un jugador y viene un suplente que no está en el sistema, el admin lo agrega como "parche" desde el armador (solo para ese partido).</Item>
          <Item k="5.">Una vez armado, se confirma el partido y queda abierto para cargar el resultado.</Item>
        </Section>

        <Section title="🏁 CIERRE DEL PARTIDO">
          <p>Al terminar de jugar, se entra al partido desde el armador y se completa:</p>
          <Item k="•"><b>Equipo ganador</b> (no hay empates).</Item>
          <Item k="•"><b>Goles</b> de cada jugador.</Item>
          <Item k="•"><b>Asistencias</b> de cada jugador.</Item>
          <Item k="•"><b>Puntuación</b> a los compañeros del 1.0 al 10.0 (escala Sofascore), para ir armando el nivel real de cada uno.</Item>
          <p className="text-foreground/70 italic pt-2">
            Recién cuando se cierra el partido, los resultados impactan en la tabla y en los rankings.
          </p>
        </Section>

        <Section title="🎮 PUNTUACIÓN ENTRE JUGADORES (estilo Sofascore)">
          <p>
            Después de cada partido, cada uno califica al resto con una nota del <b>1.0 al 10.0</b>. La nota inicial / promedio es <b>6.5</b>. Eso alimenta el <b>nivel
            promedio</b> del jugador, que el armador usa para repartir equipos parejos en el modo Auto.
          </p>
          <Item k="•">Cada nota se muestra con un color de rendimiento: rojo bajo, amarillo promedio, verde bueno, celeste muy destacado, azul excelente.</Item>
          <Item k="•">Calificá honesto: si todos inflan notas, los equipos quedan desbalanceados.</Item>
          <Item k="•">Tu nivel es el <b>promedio</b> de lo que el resto te puso a lo largo del tiempo.</Item>
        </Section>

        <Section title="👤 TU PERFIL">
          <p>En <b>Perfil</b> podés configurar:</p>
          <Item k="•"><b>Sobrenombre</b>: cómo aparecés en la tabla y en los equipos.</Item>
          <Item k="•"><b>Posiciones favoritas</b>: en qué te gusta jugar (arco, defensa, medio, delantero…). Sirve para que el armador te ponga donde rendís mejor.</Item>
          <Item k="•">Tu historial de partidos, goles, asistencias y nivel promedio.</Item>
        </Section>

        <Section title="🛡️ ADMIN">
          <p>Los admins tienen permisos extra:</p>
          <Item k="•">Agregar <b>parches</b> (jugadores ocasionales) desde el armador.</Item>
          <Item k="•">Editar partidos cerrados si hubo un error de carga.</Item>
          <Item k="•">Gestionar jugadores y roles desde el panel <b>Admin</b>.</Item>
        </Section>

        <Section title="📝 RESUMEN RÁPIDO">
          <Item k="1.">Te registrás, ponés tu sobrenombre y posiciones en <b>Perfil</b>.</Item>
          <Item k="2.">Se arma el partido en <b>Armador</b> (con parches si hace falta).</Item>
          <Item k="3.">Juegan.</Item>
          <Item k="4.">Cargan resultado, goles, asistencias y puntuaciones.</Item>
          <Item k="5.">La <b>Tabla</b> se actualiza: ganar y presentarse es lo que manda.</Item>
        </Section>
      </main>
    </div>
  );
}
