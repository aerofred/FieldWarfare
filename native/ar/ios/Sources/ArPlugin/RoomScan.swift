import Foundation
import ARKit

// The room scanned for the "room" mode, as a height grid on the floor.
//
// The grid is turned to follow the walls (the largest wall seen fixes the
// turn) so that they fall along its rows and columns. Each 10 cm cell is
// unknown (0), free floor (1) or an obstacle (2...254, its height in
// centimetres plus one, walls included).
//
// With LiDAR the mesh of the room gives the floor and every obstacle,
// furniture included. Without it, the floor comes from the horizontal planes
// ARKit finds and the obstacles from its vertical planes: walls, and the odd
// piece of furniture with a flat side.
struct RoomGrid {
    var floor: Float
    var yaw: Float
    var locked: Bool
    var x0: Float
    var z0: Float
    var cols: Int
    var rows: Int
    var cells: [UInt8]
    var area: Float
    var walls: Int
    var faces: Int
    var lidar: Bool

    var dictionary: [String: Any] {
        [
            "floor": floor, "yaw": yaw, "locked": locked, "x0": x0, "z0": z0, "cell": RoomScan.cell,
            "cols": cols, "rows": rows, "cells": Data(cells).base64EncodedString(),
            "area": area, "walls": walls, "faces": faces, "lidar": lidar
        ]
    }
}

enum RoomScan {
    static let cell: Float = 0.1
    // Larger rooms are cut to this square around the device.
    static let maxSize: Float = 12
    // Above this height (a ceiling, a lamp) nothing blocks a soldier.
    static let maxHeight: Float = 2.4
    // Lower bumps (a rug, a cable, the noise of the mesh) count as floor.
    static let minObstacle: Float = 0.08

    // Grid origin in the world: on the floor, turned by the grid's yaw.
    static func originTransform(floor: Float, yaw: Float) -> simd_float4x4 {
        let c = cos(yaw), s = sin(yaw)
        return simd_float4x4(columns: (
            simd_float4(c, 0, -s, 0), simd_float4(0, 1, 0, 0), simd_float4(s, 0, c, 0), simd_float4(0, floor, 0, 1)
        ))
    }

    private static func world(_ anchor: ARAnchor, _ local: simd_float3) -> simd_float3 {
        let w = anchor.transform * simd_float4(local, 1)
        return simd_float3(w.x, w.y, w.z)
    }

    // Area of a plane's outline, in its own horizontal coordinates.
    private static func area(_ plane: ARPlaneAnchor) -> Float {
        let v = plane.geometry.boundaryVertices
        guard v.count > 2 else { return 0 }
        var sum: Float = 0
        for i in v.indices { let a = v[i], b = v[(i + 1) % v.count]; sum += a.x * b.z - b.x * a.z }
        return abs(sum) / 2
    }

    private static func height(_ plane: ARPlaneAnchor) -> Float { plane.transform.columns.3.y }

    // The floor: planes ARKit classifies as floor where it can, otherwise
    // the lowest horizontal plane of some size well below the device.
    private static func floor(_ planes: [ARPlaneAnchor], cameraY: Float) -> Float? {
        let horizontal = planes.filter { $0.alignment == .horizontal }
        var candidates: [ARPlaneAnchor] = []
        if ARPlaneAnchor.isClassificationSupported { candidates = horizontal.filter { if case .floor = $0.classification { return true } else { return false } } }
        if candidates.isEmpty { candidates = horizontal.filter { height($0) < cameraY - 0.4 && area($0) > 0.2 } }
        return candidates.map(height).min()
    }

    // Each vertex of a mesh, in the world.
    private static func vertices(_ mesh: ARMeshAnchor, _ body: (simd_float3) -> Void) {
        let source = mesh.geometry.vertices, base = source.buffer.contents()
        for i in 0..<source.count {
            let p = base.advanced(by: source.offset + source.stride * i).assumingMemoryBound(to: Float.self)
            body(world(mesh, simd_float3(p[0], p[1], p[2])))
        }
    }

    static func grid(anchors: [ARAnchor], camera: simd_float3, yaw lockedYaw: Float?) -> RoomGrid? {
        let planes = anchors.compactMap { $0 as? ARPlaneAnchor }
        let meshes = anchors.compactMap { $0 as? ARMeshAnchor }
        guard let floor = floor(planes, cameraY: camera.y) else { return nil }

        // The largest wall turns the grid; once found, the turn stays.
        var yaw = lockedYaw ?? 0, locked = lockedYaw != nil
        if !locked, let wall = planes.filter({ $0.alignment == .vertical }).map({ ($0, area($0)) }).filter({ $0.1 > 0.4 }).max(by: { $0.1 < $1.1 }) {
            let normal = wall.0.transform.columns.1
            yaw = remainder(atan2(normal.x, normal.z), Float.pi / 2)
            locked = true
        }
        let c = cos(yaw), s = sin(yaw)
        func toGrid(_ w: simd_float3) -> SIMD2<Float> { SIMD2(w.x * c - w.z * s, w.x * s + w.z * c) }

        // Floor outlines, wall edges with their height, mesh vertices.
        var outlines: [[SIMD2<Float>]] = []
        var edges: [(SIMD2<Float>, SIMD2<Float>, Float)] = []
        var walls = 0
        for plane in planes {
            let points = plane.geometry.boundaryVertices.map { world(plane, $0) }
            guard points.count > 1 else { continue }
            if plane.alignment == .horizontal {
                if abs(height(plane) - floor) < 0.08 { outlines.append(points.map(toGrid)) }
                continue
            }
            let ys = points.map(\.y), top = (ys.max() ?? floor) - floor, bottom = (ys.min() ?? floor) - floor
            guard top > 0.25, bottom < 0.5 else { continue }
            walls += 1
            let g = points.map(toGrid)
            for i in g.indices { edges.append((g[i], g[(i + 1) % g.count], min(top, maxHeight))) }
        }
        var points: [(SIMD2<Float>, Float)] = []
        var faces = 0
        for mesh in meshes {
            faces += mesh.geometry.faces.count
            vertices(mesh) { w in
                let h = w.y - floor
                if h > -0.1 && h < maxHeight { points.append((toGrid(w), h)) }
            }
        }

        // Bounds of everything seen, cut to maxSize around the device.
        var minP = SIMD2<Float>(repeating: .infinity), maxP = SIMD2<Float>(repeating: -.infinity)
        func extend(_ p: SIMD2<Float>) { minP = simd_min(minP, p); maxP = simd_max(maxP, p) }
        outlines.forEach { $0.forEach(extend) }
        edges.forEach { extend($0.0); extend($0.1) }
        points.forEach { extend($0.0) }
        guard minP.x.isFinite else { return nil }
        let device = toGrid(camera), half = maxSize / 2
        minP = simd_max(minP, device - half); maxP = simd_min(maxP, device + half)
        guard maxP.x > minP.x, maxP.y > minP.y else { return nil }
        let cols = Int(((maxP.x - minP.x) / cell).rounded(.up)) + 1, rows = Int(((maxP.y - minP.y) / cell).rounded(.up)) + 1
        func index(_ p: SIMD2<Float>) -> Int? {
            let col = Int(((p.x - minP.x) / cell).rounded(.down)), row = Int(((p.y - minP.y) / cell).rounded(.down))
            return col >= 0 && col < cols && row >= 0 && row < rows ? row * cols + col : nil
        }

        var free = [Bool](repeating: false, count: cols * rows)
        var heights = [Float](repeating: 0, count: cols * rows)
        var hits = [UInt8](repeating: 0, count: cols * rows)
        var wall = [Bool](repeating: false, count: cols * rows)

        // Floor outlines: the cells whose centre lies inside.
        for outline in outlines where outline.count > 2 {
            var lo = outline[0], hi = outline[0]
            for p in outline { lo = simd_min(lo, p); hi = simd_max(hi, p) }
            let c0 = max(0, Int((lo.x - minP.x) / cell)), c1 = min(cols - 1, Int((hi.x - minP.x) / cell))
            let r0 = max(0, Int((lo.y - minP.y) / cell)), r1 = min(rows - 1, Int((hi.y - minP.y) / cell))
            guard c0 <= c1, r0 <= r1 else { continue }
            for row in r0...r1 {
                for col in c0...c1 {
                    let x = minP.x + (Float(col) + 0.5) * cell, z = minP.y + (Float(row) + 0.5) * cell
                    var inside = false, j = outline.count - 1
                    for i in outline.indices {
                        let a = outline[i], b = outline[j]
                        if (a.y > z) != (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x { inside.toggle() }
                        j = i
                    }
                    if inside { free[row * cols + col] = true }
                }
            }
        }
        // Mesh: floor-level vertices free their cell, higher ones raise it.
        // Two vertices are needed for an obstacle: one alone is noise.
        for (p, h) in points {
            guard let i = index(p) else { continue }
            if h < 0.05 { free[i] = true }
            else if h >= minObstacle { heights[i] = max(heights[i], h); hits[i] = hits[i] &+ (hits[i] < 255 ? 1 : 0) }
        }
        // Walls: their edges drawn every half cell.
        for (a, b, top) in edges {
            let steps = max(1, Int((simd_distance(a, b) / (cell / 2)).rounded(.up)))
            for k in 0...steps {
                guard let i = index(a + (b - a) * (Float(k) / Float(steps))) else { continue }
                heights[i] = max(heights[i], top); wall[i] = true
            }
        }

        var cells = [UInt8](repeating: 0, count: cols * rows)
        var freeCount = 0
        for i in cells.indices {
            if heights[i] >= minObstacle && (wall[i] || hits[i] >= 2) {
                cells[i] = UInt8(min(254, 1 + Int((heights[i] * 100).rounded())))
            } else if free[i] {
                cells[i] = 1; freeCount += 1
            }
        }
        return RoomGrid(floor: floor, yaw: yaw, locked: locked, x0: minP.x, z0: minP.y, cols: cols, rows: rows, cells: cells,
                        area: Float(freeCount) * cell * cell, walls: walls, faces: faces, lidar: !meshes.isEmpty)
    }

    // The LiDAR mesh in world coordinates, so the page can hide soldiers
    // behind the real furniture. Ceilings are left out.
    static func mesh(anchors: [ARAnchor], floor: Float) -> [String: Any]? {
        let meshes = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !meshes.isEmpty else { return nil }
        var positions: [Float] = [], indices: [UInt32] = []
        positions.reserveCapacity(meshes.reduce(0) { $0 + $1.geometry.vertices.count * 3 })
        for mesh in meshes {
            let base = UInt32(positions.count / 3)
            vertices(mesh) { w in positions.append(w.x); positions.append(w.y); positions.append(w.z) }
            let faces = mesh.geometry.faces, data = faces.buffer.contents(), per = faces.indexCountPerPrimitive, bytes = faces.bytesPerIndex
            for f in 0..<faces.count {
                var face = [UInt32](repeating: 0, count: per), high = true
                for k in 0..<per {
                    let offset = (f * per + k) * bytes
                    face[k] = base + (bytes == 4 ? data.load(fromByteOffset: offset, as: UInt32.self) : UInt32(data.load(fromByteOffset: offset, as: UInt16.self)))
                    if positions[Int(face[k]) * 3 + 1] - floor < maxHeight { high = false }
                }
                if !high { indices.append(contentsOf: face) }
            }
        }
        let encode: (UnsafeRawBufferPointer) -> String = { Data($0).base64EncodedString() }
        return [
            "positions": positions.withUnsafeBytes(encode),
            "indices": indices.withUnsafeBytes(encode),
            "count": positions.count / 3
        ]
    }
}
