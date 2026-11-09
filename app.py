
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import mediapipe as mp
import numpy as np
import base64

app = Flask(__name__)
CORS(app)

MAX_IMAGE_BYTES = 8 * 1024 * 1024

# Índices de los puntos de los dedos:
# punta y articulación distal.
NAIL_PAIRS = [
    {"name": "pulgar", "tip": 4, "joint": 3},
    {"name": "indice", "tip": 8, "joint": 7},
    {"name": "medio", "tip": 12, "joint": 11},
    {"name": "anular", "tip": 16, "joint": 15},
    {"name": "menique", "tip": 20, "joint": 19},
]

mp_hands = mp.solutions.hands


def estimate_nail_polygon(landmarks, tip_index, joint_index):
    """
    Estima un polígono aproximado a partir de puntos de la mano.
    No representa una segmentación real de la placa ungueal.
    Las coordenadas se devuelven normalizadas entre 0 y 1.
    """
    tip = landmarks[tip_index]
    joint = landmarks[joint_index]

    tip_point = np.array([tip.x, tip.y], dtype=np.float32)
    joint_point = np.array([joint.x, joint.y], dtype=np.float32)

    direction = joint_point - tip_point
    length = float(np.linalg.norm(direction))

    if length < 0.001:
        return None

    unit = direction / length
    perpendicular = np.array([-unit[1], unit[0]], dtype=np.float32)

    # Estimación conservadora de largo y ancho.
    center = tip_point + direction * 0.38
    nail_length = length * 0.62
    nail_width = length * 0.38

    top = center - unit * nail_length * 0.45
    bottom = center + unit * nail_length * 0.45

    half_width = nail_width / 2

    points = [
        top + perpendicular * half_width * 0.65,
        top - perpendicular * half_width * 0.65,
        bottom - perpendicular * half_width,
        bottom + perpendicular * half_width,
    ]

    polygon = []
    for point in points:
        polygon.append([
            round(float(np.clip(point[0], 0, 1)), 6),
            round(float(np.clip(point[1], 0, 1)), 6)
        ])

    return polygon


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "service": "NailVision Python Vision API"
    })


@app.post("/api/detect")
def detect_hand():
    if "image" not in request.files:
        return jsonify({
            "ok": False,
            "error": "Falta el archivo de imagen."
        }), 400

    image_file = request.files["image"]
    image_bytes = image_file.read(MAX_IMAGE_BYTES + 1)

    if not image_bytes:
        return jsonify({
            "ok": False,
            "error": "La imagen está vacía."
        }), 400

    if len(image_bytes) > MAX_IMAGE_BYTES:
        return jsonify({
            "ok": False,
            "error": "La imagen supera el límite de 8 MB."
        }), 413

    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)

    if image is None:
        return jsonify({
            "ok": False,
            "error": "No se pudo leer la imagen."
        }), 400

    height, width = image.shape[:2]
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    try:
        with mp_hands.Hands(
            static_image_mode=True,
            max_num_hands=1,
            min_detection_confidence=0.5
        ) as hands:
            result = hands.process(rgb_image)

        if not result.multi_hand_landmarks:
            return jsonify({
                "ok": True,
                "hand_detected": False,
                "image_width": width,
                "image_height": height,
                "nails": []
            })

        landmarks = result.multi_hand_landmarks[0].landmark
        nails = []

        for item in NAIL_PAIRS:
            polygon = estimate_nail_polygon(
                landmarks,
                item["tip"],
                item["joint"]
            )

            if polygon:
                nails.append({
                    "name": item["name"],
                    "polygon": polygon
                })

        return jsonify({
            "ok": True,
            "hand_detected": True,
            "image_width": width,
            "image_height": height,
            "nails": nails,
            "method": "hand_landmark_estimate"
        })

    except Exception as error:
        app.logger.exception("Error al analizar la imagen")
        return jsonify({
            "ok": False,
            "error": "Ocurrió un error al analizar la imagen."
        }), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
