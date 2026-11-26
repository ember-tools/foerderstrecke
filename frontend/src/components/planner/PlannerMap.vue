<script setup lang="ts">
import {escapeSvg} from '@emberbox/ui'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch} from 'vue'
import {pumpType} from '../../hydraulics/pumps'
import {t} from '../../i18n'
import {type LatLng, pointAt, projectOnto, segmentAt, sliceRoute} from '../../plan/geo'
import {allSections} from '../../plan/sections'
import {sectionStatus} from '../../plan/status'
import {isHydrant} from '../../plan/model'
import type {PlanStore} from '../../plan/store'
import {endSymbol, pumpSymbol, sourceSymbol} from '../../plan/symbols'
import {createTileLayer} from '../../scripts/tile-layer'
import {DEFAULT_CENTER, DEFAULT_ZOOM, MAP_LIMITS} from '../../scripts/tiles'

/**
 * The map of a planned line: the route as sections coloured by how they stand, the source and the
 * end as tactical marks, the route's other vertices as handles, and the pumps as symbols that
 * slide along the route when dragged. While drawing, a click on the map extends the route. Leaflet
 * owns the classes of its container, so the drawing state sits on an element around it.
 */
const props = defineProps<{ store: PlanStore, drawing: boolean, hover: number | null }>()

const container = useTemplateRef<HTMLDivElement>('container')
const map = shallowRef<L.Map | null>(null)
const lines = L.layerGroup()
const handles = L.layerGroup()
const pumps = L.layerGroup()
const cursor = L.circleMarker([0, 0], {radius: 7, className: 'planner-hover', interactive: false})

/** Show the whole route. */
function fit() {
    const route = props.store.plan.value.route
    if (map.value && route.length >= 2) map.value.fitBounds(L.latLngBounds(route.map(point => [...point] as [number, number])), {padding: [40, 40]})
}

defineExpose({fit})

function icon(html: string, className = 'planner-icon'): L.DivIcon {
    return L.divIcon({html, className, iconSize: undefined})
}

function marker(symbol: string, lines: string[], extra = ''): string {
    const captions = lines.filter(Boolean)
        .map(line => `<span class="planner-marker-caption">${escapeSvg(line)}</span>`).join('')
    return `<div class="planner-marker ${extra}"><span class="planner-marker-symbol">${symbol}</span>${captions}</div>`
}

function latLng(point: LatLng): L.LatLngTuple {
    return [point[0], point[1]]
}

function onLineClick(event: L.LeafletMouseEvent) {
    const route = props.store.plan.value.route
    const position: LatLng = [event.latlng.lat, event.latlng.lng]
    if (props.drawing) {
        props.store.appendVertex(position)
        return
    }
    const at = projectOnto(route, position)
    props.store.insertVertex(segmentAt(route, at), pointAt(route, at))
}

function drawLines() {
    lines.clearLayers()
    const {route} = props.store.plan.value
    const result = props.store.result.value
    if (route.length < 2) return
    const parts = result && result.sections.length
        ? allSections(result).map(entry => entry.section).filter(section => section.length > 0)
            .map(section => ({from: section.start, to: section.end, status: sectionStatus(section)}))
        : [{from: 0, to: props.store.length.value, status: 'none'}]
    for (const part of parts) {
        L.polyline(sliceRoute(route, part.from, part.to).map(latLng), {
            className: `planner-line is-${part.status}`, weight: 5, bubblingMouseEvents: false,
        }).on('click', onLineClick).addTo(lines)
    }
}

function drawHandles() {
    handles.clearLayers()
    const {route} = props.store.plan.value
    route.forEach((point, index) => {
        const first = index === 0
        const last = index === route.length - 1 && route.length > 1
        const html = first
            ? marker(sourceSymbol(props.store.plan.value), [t(`planner.source.${props.store.plan.value.source.kind}`)])
            : last
                ? marker(endSymbol(props.store.plan.value), [t('planner.end.label')])
                : '<div class="planner-vertex"></div>'
        const handle = L.marker(latLng(point), {
            icon: icon(html, first || last ? 'planner-icon' : 'planner-icon is-vertex'),
            draggable: true,
            keyboard: false,
            zIndexOffset: first || last ? 500 : 0,
        })
        handle.on('dragend', () => {
            const moved = handle.getLatLng()
            props.store.moveVertex(index, [moved.lat, moved.lng])
        })
        handle.on('dblclick', () => props.store.removeVertex(index))
        handle.addTo(handles)
    })
}

function drawPumps() {
    pumps.clearLayers()
    const {route} = props.store.plan.value
    if (route.length < 2) return
    const stations = props.store.result.value?.stations ?? []
    props.store.pumps.value.forEach((pump, index) => {
        const type = pumpType(pump.type)
        const station = stations[index]
        const caption = [`P${index + 1}`]
        const pinnedToSource = index === 0 && !isHydrant(props.store.plan.value.source.kind)
        const handle = L.marker(latLng(pointAt(route, pump.at)), {
            icon: icon(marker(pumpSymbol(type), caption, station?.capped || station?.warnings.length ? 'has-warning' : '')),
            draggable: !pinnedToSource,
            keyboard: false,
            zIndexOffset: 1000,
        })
        handle.on('drag', () => {
            const at = projectOnto(route, [handle.getLatLng().lat, handle.getLatLng().lng])
            handle.setLatLng(latLng(pointAt(route, at)))
        })
        handle.on('dragend', () => {
            props.store.movePump(pump.id, projectOnto(route, [handle.getLatLng().lat, handle.getLatLng().lng]))
        })
        handle.addTo(pumps)
    })
}

function drawCursor() {
    const route = props.store.plan.value.route
    if (props.hover === null || route.length < 2) {
        cursor.remove()
        return
    }
    cursor.setLatLng(latLng(pointAt(route, props.hover)))
    if (map.value && !map.value.hasLayer(cursor)) cursor.addTo(map.value)
}

onMounted(() => {
    if (!container.value) return
    const plan = props.store.plan.value
    const created = L.map(container.value, {...MAP_LIMITS, zoomControl: true, doubleClickZoom: false, keyboard: false})
        .setView(latLng(plan.view?.center ?? plan.route[0] ?? DEFAULT_CENTER), plan.view?.zoom ?? DEFAULT_ZOOM)
    createTileLayer().addTo(created)
    lines.addTo(created)
    handles.addTo(created)
    pumps.addTo(created)
    created.on('click', event => {
        if (props.drawing) props.store.appendVertex([event.latlng.lat, event.latlng.lng])
    })
    created.on('moveend', () => {
        const center = created.getCenter()
        props.store.plan.value.view = {center: [center.lat, center.lng], zoom: created.getZoom()}
    })
    map.value = created
    if (!plan.view) fit()
})

watch(() => [props.store.plan.value.route, props.store.result.value, props.store.plan.value.source.kind,
    props.store.plan.value.end.preset], () => {
    drawLines()
    drawHandles()
    drawPumps()
}, {deep: true, immediate: true})

watch(() => props.hover, drawCursor)

onBeforeUnmount(() => {
    map.value?.remove()
    map.value = null
})
</script>

<template>
  <div class="planner-map size-full" :class="{'is-drawing': drawing}">
    <div ref="container" class="size-full"/>
  </div>
</template>

<style>
.planner-map {
  isolation: isolate;
  background-color: var(--ui-bg-muted);
}

.planner-map.is-drawing .leaflet-container {
  cursor: crosshair;
}

.planner-icon {
  background: none;
  border: none;
}

.planner-marker {
  --planner-marker-size: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: max-content;
  min-width: var(--planner-marker-size);
  transform: translate(-50%, calc(var(--planner-marker-size) / -3));
}

.planner-marker-symbol {
  display: block;
  width: var(--planner-marker-size);
  line-height: 0;
  filter: drop-shadow(0 1px 1px color-mix(in srgb, var(--color-black) 35%, transparent));
}

.planner-marker-symbol svg {
  width: 100%;
  height: auto;
}

.planner-marker.has-warning .planner-marker-symbol {
  outline: 2px solid var(--ui-warning);
  outline-offset: 2px;
}

.planner-marker-caption {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--color-steel-950);
  text-shadow: 0 0 2px var(--color-white), 0 0 2px var(--color-white), 0 0 3px var(--color-white);
  white-space: nowrap;
}

.planner-vertex {
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border: 2px solid var(--color-steel-900);
  border-radius: 50%;
  background-color: var(--color-white);
}

.planner-line {
  stroke: var(--color-steel-700);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.planner-line.is-ok {
  stroke: var(--ui-success);
}

.planner-line.is-fails {
  stroke: var(--ui-error);
  stroke-dasharray: 10 6;
}

.planner-hover {
  stroke: var(--color-white);
  stroke-width: 3;
  fill: var(--ui-primary);
  fill-opacity: 1;
}
</style>
