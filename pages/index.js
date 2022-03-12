import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Dropzone from "react-dropzone";
import styles from "../styles/Home.module.scss";
const tf = require("@tensorflow/tfjs");
import "@tensorflow/tfjs-backend-wasm";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import Stats from "stats.js";
// import Tracker from "../utils/tracking/main";

const labels = [
  { name: "c", color: "#a2f8c4" },
  { name: "ni", color: "#e64b4a" },
];

const models = [
  { name: "n6-834-256-q8", inputSz: 256 },
  { name: "n6-834-320-q8", inputSz: 320 },
  { name: "n6-834-640-q8", inputSz: 640 },
  { name: "n6-834-1280-q8", inputSz: 1280 }
];

export default function Home() {
  const [model, setModel] = useState(null);
  const [inputSz, setInputSz] = useState(0);
  const [preview, setPreview] = useState("");
  const [modelLoading, setModelLoading] = useState(false)
  const vidPlaying = useRef(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stats, setStats] = useState();

  useEffect(() => {
    (async () => {
      try {
        setWasmPaths("/wasm/");
        await tf
        .setBackend("webgl")
        .then(console.log("The Backend is", tf.getBackend()));
        await loadModel(models[0]);

        var stats = new Stats();
        stats.showPanel(1);
        setStats(stats)
        document.body.appendChild(stats.dom);
      } catch (err) {
        console.log(err);
      }
    })();
  }, []);

  const loadModel = async _model => {
    try {
      const { name, inputSz } = { ..._model };
      console.log(_model)
      setModelLoading(true);
      const model = await tf.loadGraphModel(`/${ name }/model.json`);
      setModel(model);
      setInputSz(inputSz)
      setModelLoading(false);
    } catch (err) {
      console.log(err)
    }
  }

  const onDrop = useCallback((acceptedFiles, links) => {
    // Do something with the files
    const url = URL.createObjectURL(acceptedFiles[0]);
    setPreview(url);
  }, []);

  const onDraw = () =>
  {
    const c = canvasRef.current;
    const ctx = canvasRef.current.getContext("2d");
    const vid = videoRef.current;
    const cw = c.width;
    const ch = c.height;
    const loop = async () => {
      stats.begin();
      if (vidPlaying.current) {
        const all_start = new Date().getTime();
        // Detection
        const det_start = new Date().getTime();
        const detectData = await onDetect();
        const det_end = new Date().getTime();
        let cmasks = 0;
        let nimasks = 0;

        const [boxes_data, scores_data, classes_data, valid_detections_data] = detectData;
        tf.dispose(valid_detections_data);
        console.log(`Detection: ${ det_end - det_start } ms`);

        // Draw
        const draw_start = new Date().getTime();
        const font = "16px sans-serif";
        ctx.font = font;
        ctx.textBaseline = "top";
        
        ctx.drawImage(vid, 0, 0, c.width, c.height);
        
        for (let i = 0; i < valid_detections_data; ++i) {
          let [x1, y1, x2, y2] = boxes_data.slice(i * 4, (i + 1) * 4);
          x1 *= cw;
          x2 *= cw;
          y1 *= ch;
          y2 *= ch;
          const width = x2 - x1;
          const height = y2 - y1;
          const label = labels[classes_data[i]];
          if (classes_data[i] === 0) cmasks++;
          else nimasks++;
          const score = scores_data[i].toFixed(2);

          // Draw the bounding box.
          ctx.strokeStyle = label.color;
          ctx.strokeRect(x1, y1, width, height);
        }
        const draw_end = new Date().getTime();
        console.log(`Draw:     ${draw_end - draw_start} ms`);
        
        stats.end();
        requestAnimationFrame(loop);
        const all_end = new Date().getTime();
        console.log(`All:      ${ all_end - all_start } ms`);

        // setStats({
        //   cmasks: cmasks,
        //   nimasks: nimasks
        // });
      }
    };
    requestAnimationFrame(loop);
  };

  const onDetect = async () => {
    const transf_start = new Date().getTime();
    const input = tf.tidy(() => {
      return tf.image
        .resizeBilinear(tf.browser.fromPixels(canvasRef.current), [
          inputSz,
          inputSz,
        ])
        .div(255.0)
        .expandDims(0);
    });
    console.log("Transf: ", new Date().getTime() - transf_start);
    try {
      const res = await model.executeAsync(input);
      const [boxes, scores, classes, valid_detections] = res;
      const boxes_data = boxes.dataSync();
      const scores_data = scores.dataSync();
      const classes_data = classes.dataSync();
      const valid_detections_data = valid_detections.dataSync()[0];

      return [boxes_data, scores_data, classes_data, valid_detections_data];
    } catch (err) {
      console.log(err);
    }
  };

  const setVidPlaying = (value) => {
    vidPlaying.current = value;
  };

  if (modelLoading) {
    return <p style={{ textAlign: "center" }}>Model is loading ...</p>
  }

  return (
    <Fragment>
      <section>
        <div className={styles.models}>
          <p>Select model: </p>
          {models.map((m) => (
            <button
              key={m.inputSz}
              className={[styles.model, inputSz === m.inputSz ? 'active' : ''].join(' ')}
              onClick={() => { loadModel(m) }}>{m.inputSz}</button>
          ))}
        </div>
      </section>
      <section className={styles["section"]}>
        {preview && (
          <>
            <video
              ref={videoRef}
              src={preview}
              width={1280}
              height={720}
              muted
              onEnded={() => {
                setVidPlaying(false);
              }}
              onClick={() => {
                if (vidPlaying.current) {
                  videoRef.current.pause();
                } else {
                  videoRef.current.play();
                }
                onDraw();
                setVidPlaying(!vidPlaying.current);
              }}
            ></video>
            <canvas
              className={styles["main-cv"]}
              id="main-cv"
              ref={canvasRef}
              width={1280}
              height={720}
              onClick={() => {
                if (vidPlaying.current) {
                  videoRef.current.pause();
                } else {
                  videoRef.current.play();
                }
                onDraw();
                setVidPlaying(!vidPlaying.current);
              }}
            ></canvas>
          </>
        )}
      </section>
      <Dropzone onDrop={onDrop}>
        {({ getRootProps, getInputProps }) => (
          <section>
            <div className={styles.dropzone} {...getRootProps()}>
              <input {...getInputProps()} />
              <p>Drag and drop some files here, or click to select files</p>
            </div>
          </section>
        )}
      </Dropzone>
    </Fragment>
  );
}
