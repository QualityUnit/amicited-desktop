import Foundation
import Vision
import ImageIO

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.regionOfInterest = CGRect(x: 0.65, y: 0.94, width: 0.35, height: 0.06)
try VNImageRequestHandler(url: url).perform([request])
let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
if text.range(of: #"\d+\s*px\s*[×xX]\s*\d+\s*px"#, options: .regularExpression) != nil {
    fputs("Viewport overlay detected: \(text)\n", stderr)
    exit(1)
}
