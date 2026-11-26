# Hydraulics

How Förderstrecke calculates a relay line, and where every value comes from. The calculation is a
training model taken from German-language fire service teaching material; it is not an operational
tool. Where the model goes beyond the sources, the text says so as a **modelling choice**.

## Quantities

| Symbol | German term | Meaning | Unit |
|---|---|---|---|
| Q | Förderstrom | flow through the line | l/min |
| p_N | Nennförderdruck | a pump's nominal pressure | bar |
| p_a | Ausgangsdruck | absolute pressure at a pump's discharge | bar |
| p_e | Eingangsdruck | pressure at a pump's inlet | bar |
| p_R | Druckverlust durch Reibung | friction loss in the hose | bar |
| p_geo | Druckverlust/-gewinn durch Höhe | loss uphill, gain downhill | bar |
| p_end | Druckbedarf am Ende | pressure the line must deliver at its end | bar |
| p_v | verfügbarer Druck | p_a − 1.5 bar for a booster section, p_a − p_end for the last one | bar |

## Rules shared by every source

- **Height:** 1 bar per 10 m rise is lost, 1 bar per 10 m fall is gained. [HLFS-WF 5.6], [WUP 11]
- **Inlet pressure:** water reaching a pump through hoses should arrive with at least 1.5 bar.
  [HLFS-WF 5.2, 7.1, 7.2], [CGDIS 48]
- **Nozzle pressure:** 5 bar for multi-purpose nozzles, 6 bar for hollow-jet nozzles, needed at
  the dividing breeching; 1 bar more is counted for the lines from the breeching to the nozzles.
  [HLFS-WF 2.2, 5.7]
- **Friction scales with length:** double the length, double the loss. [HLFS-WF 5.5]
- **Friction scales with flow:** double the flow, roughly four times the loss. [HLFS-WF 5.5],
  [WUP 10]
- **Hose length:** B and A hoses are counted at 20 m each, the common length of B pressure hoses
  (DIN 14811). Modelling choice; other lengths are not offered in v1.

## Pressure needed at the end

The line's end requirement p_end is one input. Presets:

- multi-purpose nozzles: 5 + 1 = **6 bar** (default),
- hollow-jet nozzles: 6 + 1 = **7 bar**,
- free outflow into a tank: **0 bar** (see open relay),
- any other value, which is how tasks from the sources enter their own figure (for example the
  4.5 bar of [CGDIS]).

## Friction tables

The teaching material does not agree on the friction loss of a B line. Förderstrecke ships two B
tables, names the one in use on every line and every task, and lets the user switch.

Loss per 100 m of B hose (B-75):

| Q (l/min) | Berlin / NRW (default) | Hessen |
|---|---|---|
| 200 | 0.1 | – |
| 250 | 0.15 | – |
| 300 | 0.2 | – |
| 350 | 0.25 | – |
| 400 | 0.3 | 0.3 |
| 450 | 0.4 | – |
| 500 | 0.5 | – |
| 600 | 0.7 | 0.6 |
| 700 | 0.9 | – |
| 800 | 1.1 | 1.0 |
| 900 | 1.5 | – |
| 1000 | 1.7 | 1.4 |
| 1100 | 1.9 | – |
| 1200 | 2.5 | 2.0 |
| 1300 | 2.9 | – |
| 1400 | 3.45 | – |
| 1500 | 4.0 | – |
| 1600 | 4.6 | 4.0 |
| 1700 | 5.2 | – |
| 1800 | 5.8 | – |
| 1900 | 6.4 | – |
| 2000 | 7.0 | – |
| 2100 | 7.6 | – |
| 2200 | 8.2 | – |
| 2300 | 8.8 | – |
| 2400 | 9.4 | – |
| 2500 | 10.0 | – |

- **Berlin / NRW:** Berliner Feuerwehr training values at 400, 800, 1000 and 1200 l/min (given by
  Berlin instructors); [WUP 10] at 400, 500, 600, 800, 1000 and 1200 l/min; every other row from
  [CGDIS 45]. All three agree on the four Berlin points. They differ only at 600 l/min, where
  CGDIS gives 0.6 and WUP's 0.7 is used.
- **Hessen:** [HLFS-WF table 4].

Loss per 100 m of A hose (A-110), one table, [CGDIS 45]:

| Q (l/min) | bar | Q (l/min) | bar | Q (l/min) | bar |
|---|---|---|---|---|---|
| 1000 | 0.3 | 1700 | 0.75 | 2400 | 1.45 |
| 1100 | 0.35 | 1800 | 0.8 | 2500 | 1.6 |
| 1200 | 0.4 | 1900 | 0.9 | 2600 | 1.75 |
| 1300 | 0.45 | 2000 | 1.0 | 2700 | 1.9 |
| 1400 | 0.5 | 2100 | 1.1 | 2800 | 2.0 |
| 1500 | 0.6 | 2200 | 1.2 | 2900 | 2.15 |
| 1600 | 0.65 | 2300 | 1.3 | 3000 | 2.3 |

In the text, r(Q) is the loss per 100 m read from the line's table.

**Between table points** the loss follows a power law through both neighbours: for
Q_i ≤ Q ≤ Q_{i+1},

```
p_R(Q) = p_i · (Q / Q_i)^k,   k = ln(p_{i+1} / p_i) / ln(Q_{i+1} / Q_i)
```

which is exact at every table point, continuous and rises with Q. **Outside the table**, below the
first or above the last point, the four-times rule extrapolates with exponent 2 from the nearest
point. Modelling choice.

Other hose sizes appear only behind the breeching, which the 1 bar rule covers. For reference at
400 l/min per 100 m: C-52 1.7 bar, C-42 5.4 bar [HLFS-WF table 3]; Berlin gives 5.3 bar for C-42.

**Double line:** two parallel lines each carry Q/2; the loss per line is the table value at Q/2
(roughly a quarter of the single-line loss, by the four-times rule).

## Pumps

Nominal values after DIN EN 1028-1 [HLFS-P table 2]:

| Pump | p_N | Q_N |
|---|---|---|
| FPN 6-500 | 6 bar | 500 l/min |
| FPN 10-750 | 10 bar | 750 l/min |
| FPN 10-1000 | 10 bar | 1000 l/min |
| FPN 10-1500 | 10 bar | 1500 l/min |
| FPN 10-2000 | 10 bar | 2000 l/min |
| FPN 15-1000 | 15 bar | 1000 l/min |

A portable pump PFPN 10-1000 counts as FPN 10-1000.

**Discharge pressure.** p_a is the absolute pressure at the discharge, as read on the gauge. A line
has one p_a for all its pumps, 8 bar by default, the customary value with reserve [WUP 11];
instructors often lower it, for example to 5 bar to spare the pumps. Each pump may override it.

A pump adds its own pressure to what reaches its inlet [HLFS-WF 5.4], so p_a is capped at
p_N + max(p_e, 0). Suction (negative p_e) is counted as 0 for the cap. Modelling choice. When the
line's p_a exceeds a pump's cap, the pump runs at its cap and the planner flags it.

**Capability warnings**, after the guarantee points of DIN EN 1028-1 [HLFS-P 4.2]:

- Q > Q_N: the pump is not rated for this flow.
- Suction lift (water surface to pump centre) > 3 m: less than Q_N at p_N is guaranteed;
  > 7.5 m: only ½ Q_N is guaranteed; > 8 m: beyond the practical suction lift [HLFS-WF 4.3.2],
  an error.

## Sources of water

- **Open water:** the first pump draws by suction; geodetic suction lift as above.
- **Hydrant:** the user enters mains pressure and yield; typical mains pressure is 1.5 to 4.5 bar,
  yield about 800 l/min from an underground and about 1500 l/min from a pillar hydrant
  [HLFS-WF 4.2]. The intake stretch from hydrant to first pump has its own hoses, friction and
  height: p_e = p_hydrant − p_R − p_geo must be at least 1.5 bar [HLFS-WF 7.1]; with the pump at the
  hydrant the stretch has no length and the mains pressure itself must reach 1.5 bar. Q above the
  entered yield is an error.
- **Tank** (portable or a vehicle's): the pump draws from it by suction, p_e counted as 0.

## Closed and open relay

A line is built as a closed relay (geschlossene Schaltreihe) or an open relay (offene Schaltreihe)
[HLFS-WF 3]; each booster station may differ from the line's setting.

- **Closed:** the hose feeds the next pump's inlet directly. The section must arrive with
  p_e ≥ 1.5 bar, and that inlet pressure raises the next pump's cap.
- **Open:** the hose ends in a portable tank (Faltbehälter, Abrollbehälter) with free outflow, and
  the next pump draws from the tank. The section only has to reach the tank with pressure
  ≥ 0 at the hose end (modelling choice; the sources say "freier Auslauf" without a figure). The
  next pump starts from p_e = 0. A tank buffers the line against short interruptions; with free
  outflow there is no back pressure, which can cause cavitation or stop the priming device from
  switching off [HLFS-WF 7.3]. Filling a vehicle's own tank instead is possible but should be
  avoided because it soils the tank [HLFS-WF 3].

## Calculation

A line runs from the source through pump stations to the end. Each section runs from one pump's
discharge to the next station or the end.

**Section check.** Along a section of length L with the height profile h(x):

```
p(x) = p_a − r(Q) · x / 100 m − (h(x) − h(0)) / 10 m
```

On a double line, r is read at Q/2.

The section holds when

- p(L) meets its requirement: ≥ 1.5 bar (closed station), ≥ 0 (open station), ≥ p_end (end), and
- p(x) ≥ 0 everywhere along it, so the water gets over every crest (modelling choice; matters
  only with real terrain).

The difference at the end is the section's reserve or shortfall.

TODO: no sourced upper limit for hose pressure yet; long downhill runs are not checked against one.

**Pump suggestion (planner).** Walking from the source along the profile, each next pump is placed
at the farthest whole hose (multiple of 20 m) at which the section still holds; the walk ends when
the last pump can reach the end. If not even one hose (20 m) from a station holds, the line is
not feasible from that station; the walk stops and reports it. The number of pumps placed is
the planner's answer. This works for real terrain, open, closed and mixed lines alike.

**Textbook solution (learning tasks).** Tasks use a uniform profile and a closed line with equal
pumps, and are solved as taught:

```
needed = Σ p_R + Σ p_geo + p_end              (total loss)
pumps  = max(1, 1 + ceil((needed − p_a) / (p_a − 1.5 bar)))
```

The first pump delivers p_a in full, each booster adds p_a − 1.5 bar [CGDIS 49–50]. Spacing of the
boosters, where r is the friction and g the height loss per 100 m:

```
booster spacing   = (p_a − 1.5 bar) / (r + g) × 100 m
last section max  = (p_a − p_end)  / (r + g) × 100 m
```

both rounded down to whole hoses. They need r + g > 0; on ground falling steeply enough that
r + g ≤ 0, height gain alone carries the water and no booster is needed.
If p_a ≤ 1.5 bar, a closed line cannot be relayed at all. If p_a < p_end on a line that loses
pressure (r + g > 0), the last section cannot deliver p_end, whatever the number of pumps.

Because the spacing is rounded to whole hoses, placing the boosters can need one pump more than
the pressure budget says (see reference case 2). In a learning task the answer that counts is the
**textbook** one; the solution shows the placed line as well and explains the difference when
there is one.

**Hoses.** Per section, length / 20 m rounded up; a double line doubles it. Reserve: one hose of
the line's size per started 100 m of line length, ceil(total length / 100 m),
doubled for a double line; a textbook rule of thumb [ECOMED], adjustable.

## Reference cases

These cases become tests of the calculation core. Each lists the source's own inputs; where a
source's rounding or method leaves a line short, the expected result here is the correct one.

1. **Short line** [CGDIS 51–53]: 640 m, Q 1000 l/min, 1.7 bar per 100 m, 30 m rise, p_end 4.5 bar,
   p_a 10 bar. Total 10.88 + 3 + 4.5 = 18.38 bar; 1 + ceil(8.38 / 8.5) = **2 pumps**.
2. **Long line** [WUP 11, Beispiel 01]: 3600 m, Q 1000 l/min, 1.7 bar per 100 m, 65 m rise,
   p_end 5 bar, p_a 8 bar (the source's p_v 6.5 bar). Total 72.7 bar. Textbook:
   1 + ceil(64.7 / 6.5) = **11 pumps** (8 + 10 × 6.5 = 73 ≥ 72.7). The source reaches 11 by
   rounding 72.7 / 6.5 = 11.18 down, a method that would be wrong in general. Placed on whole
   hoses: g = 6.5 bar / 36 = 0.181 bar per 100 m, r + g = 1.881 bar per 100 m, booster spacing
   6.5 / 1.881 × 100 = 345.6 → 340 m, last section ≤ 3 / 1.881 × 100 = 159.5 m;
   10 × 340 + 159.5 = 3559.5 m < 3600 m, so the planner places **12 pumps**.
3. **Spacing** [WUP 11, Beispiel 02]: Q 800 l/min, 1.1 bar per 100 m, 30 m rise spread evenly over
   1000 m (0.3 bar per 100 m), p_a 8 bar. (8 − 1.5) / 1.4 × 100 = 464.3 m; the source places the
   next pump at 460 m, in whole hoses also **460 m (23 hoses)**.
4. **Mixed pumps** [CGDIS 54–57]: 1460 m, Q 1000 l/min, 1.7 bar per 100 m, 57 m rise and 3 m fall,
   p_end 4.5 bar. Total 24.82 + 5.7 − 0.3 + 4.5 = 34.72 bar. The first pump PFPN 10-1000 at
   10 bar, boosters at p_e 1.5 bar: one FPN 15 at 15 bar adds 13.5 bar, PFPN 10-1000 at
   10 bar add 8.5 bar each. 34.72 − 10 − 13.5 = 11.22; ceil(11.22 / 8.5) = 2 → **4 pumps**
   (10 + 13.5 + 2 × 8.5 = 40.5 ≥ 34.72; with three, 32 < 34.72). The source names this pump
   FPN 15-1000 on one slide and FPN 15-2000 on the next; only its
   15 bar matter here. The source does not say where the fall lies; the learning task draws the
   rise over the first 1000 m and the fall over the last 460 m, which changes the sketch and where
   the pumps stand, not their number.
5. **Textbook series** [CGDIS 66–68], all Q 1000 l/min, 1.7 bar per 100 m, p_end 4.5 bar,
   p_a 10 bar:
   - Aufgabe 2.1: 1700 m, 80 m rise, total 41.4 bar → **5 pumps**.
   - Aufgabe 2.2: 2500 m, 70 m rise, total 54 bar → **7 pumps**.
   - Aufgabe 2.3: 2000 m, 50 m rise, total 43.5 bar → **5 pumps**.

## Sources

- [HLFS-WF] Hessische Landesfeuerwehrschule, Ausbildungsleitfaden Maschinist, 4.5 Lernunterlage
  „Wasserförderung“, 05/2021.
  https://hlfs.hessen.de/sites/hlfs.hessen.de/files/2022-09/FB-KA-Ma_4.5_LernU_Wasserf%C3%B6rderung_V001_1.pdf
- [HLFS-P] Hessische Landesfeuerwehrschule, Ausbildungsleitfaden Maschinist, 3.5 Lernunterlage
  „Feuerlöschkreiselpumpen“, 03/2021.
  https://hlfs.hessen.de/sites/hlfs.hessen.de/files/2022-09/FB-KA-Ma_3.5_LernU_Feuerl%C3%B6schkreiselpumpen_V001_0.pdf
- [WUP] Feuerwehr Wuppertal, Lehrgangsunterlage Maschinist FF, 11/2023; chapter 10
  „Förderstrom Q“ (friction table), chapter 11 „Löschwasserförderung über lange Wegstrecke“.
  https://wuppertal.de/microsite/feuerwehr/freiwillige_feuerwehr/2023_11_Lehrgangsunterlage_Maschinist_FF_I_2023_V1.pdf
- [CGDIS] Corps grand-ducal d'incendie et de secours, COM III „Wasserversorgung“, handout dated
  22/08/2019 (published 10/2022); numbers are slide pages.
  https://112.public.lu/content/dam/112/fr/formation/handouts-leveso/com-iii/2022-10-19-com-iii-wasserversorgung.pdf
- [ECOMED] Reading sample, ecomed Sicherheit, ISBN 978-3-609-69427-6 (reserve hoses on long
  relay lines); not retrievable at the time of writing, cited from its search excerpt.
- Berliner Feuerwehr: friction values for B and C-42 hoses as taught in Berlin.

The Truppmann material of the HLFS (TrM 2, 11.x) was read and adds no figures beyond the sources
above.
