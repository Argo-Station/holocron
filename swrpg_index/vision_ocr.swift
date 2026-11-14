// vision_ocr — the rules index's OCR engine on macOS (ruling `ocr-rotation-repair` R-ORR-2).
//
// Reads each image path given on the command line with the macOS Vision framework
// (VNRecognizeTextRequest: accurate level, language correction on, en-US) and prints one JSON
// object per line: {"path": "...", "text": "..."}. Lines of recognized text are joined with "\n"
// in Vision's reading order. An image that cannot be opened prints an empty text.
//
// This is the recognizer behind the screenshot -> copy text technique (ruling `species-parity`
// Addendum 5), made callable. `swrpg_index.cli ocr --engine vision` compiles it on demand with
// `swiftc` into the gitignored OCR cache directory; nothing here is committed as a binary.
import AppKit
import Foundation
import Vision

func recognize(_ path: String) -> String {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return "" }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    req.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try? handler.perform([req])
    return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

for p in CommandLine.arguments.dropFirst() {
    let data = try! JSONSerialization.data(withJSONObject: ["path": p, "text": recognize(p)])
    print(String(data: data, encoding: .utf8)!)
}
