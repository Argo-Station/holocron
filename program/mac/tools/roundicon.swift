// roundicon.swift — build.mjs's helper: draws a square PNG into one with 22 % corners (the frames' `.ico`), at a size.
//   roundicon <in.png> <out.png> <pixels>
import AppKit

let a = CommandLine.arguments
guard a.count == 4, let src = NSImage(contentsOfFile: a[1]), let px = Int(a[3]) else { fputs("usage: roundicon in out px\n", stderr); exit(2) }
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let r = NSRect(x: 0, y: 0, width: px, height: px)
NSBezierPath(roundedRect: r, xRadius: CGFloat(px) * 0.22, yRadius: CGFloat(px) * 0.22).addClip()
src.draw(in: r)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
