import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- CONFIGURATION ---
const GRID_SIZE = 16;
const BAR_SPACING = 1.2;
const BAR_WIDTH = 1;
const FFT_SIZE = 512;

class Visualizer {
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private renderer: THREE.WebGLRenderer;
	private controls: OrbitControls;
	private bars: THREE.Mesh[] = [];

	private audioContext: AudioContext;
	private analyser: AnalyserNode;
	private gainNode: GainNode;
	private dataArray!: Uint8Array;
	private audioSource: AudioBufferSourceNode | null = null;
	private isPlaying: boolean = false;

	private curColor: THREE.Color;
	private targetColor: THREE.Color;

	constructor() {
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		this.renderer = new THREE.WebGLRenderer({
			canvas: document.querySelector('#visualizer') as HTMLCanvasElement,
			antialias: true,
			alpha: true
		});

		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(window.devicePixelRatio);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.05;
		this.controls.autoRotate = true;
		this.controls.autoRotateSpeed = 0.5;

		this.curColor = new THREE.Color('#00ffcc');
		this.targetColor = new THREE.Color('#00ffcc');

		this.setupScene();
		this.createBars();
		this.setupAudio();
		this.setupEventListeners();
		this.animate();
	}

	private setupScene() {
		this.camera.position.set(20, 20, 20);
		this.controls.update();

		const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		this.scene.add(ambientLight);

		const pointLight = new THREE.PointLight(0xffffff, 1);
		pointLight.position.set(10, 20, 10);
		this.scene.add(pointLight);

		// Add a glowing floor
		const floorGeometry = new THREE.PlaneGeometry(80, 80);
		const floorMaterial = new THREE.MeshStandardMaterial({
			color: 0x050505,
			roughness: 0.1,
			metalness: 0.5,
			transparent: true,
			opacity: 0.5
		});
		const floor = new THREE.Mesh(floorGeometry, floorMaterial);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = -1;
		this.scene.add(floor);

		this.scene.fog = new THREE.FogExp2(0x050505, 0.02);
	}

	private createBars() {
		const geometry = new THREE.BoxGeometry(BAR_WIDTH, 1, BAR_WIDTH);
		const offset = (GRID_SIZE * BAR_SPACING) / 2;

		for (let x = 0; x < GRID_SIZE; x++) {
			for (let z = 0; z < GRID_SIZE; z++) {
				const material = new THREE.MeshStandardMaterial({
					color: this.curColor,
					emissive: this.curColor,
					emissiveIntensity: 0.2,
					roughness: 0.3,
					metalness: 0.7
				});

				const bar = new THREE.Mesh(geometry, material);
				bar.position.set(
					x * BAR_SPACING - offset,
					0,
					z * BAR_SPACING - offset
				);

				this.bars.push(bar);
				this.scene.add(bar);
			}
		}
	}

	private setupAudio() {
		this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		this.analyser = this.audioContext.createAnalyser();
		this.analyser.fftSize = FFT_SIZE;
		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value = 0.5;

		this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
	}

	private setupEventListeners() {
		const upload = document.getElementById('audio-upload') as HTMLInputElement;
		const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
		const volumeSlider = document.getElementById('volume-control') as HTMLInputElement;
		const minimizeBtn = document.getElementById('minimize-btn') as HTMLButtonElement;
		const controlsPanel = document.getElementById('controls-panel');
		const status = document.getElementById('status-text');

		upload.addEventListener('change', async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			if (status) status.textContent = `Loading: ${file.name}...`;

			try {
				const arrayBuffer = await file.arrayBuffer();
				const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

				this.playAudio(audioBuffer);
				if (status) status.textContent = `Playing: ${file.name}`;

				// Auto-minimize on play
				controlsPanel?.classList.add('minimized');
			} catch (err) {
				console.error('Error decoding audio:', err);
				if (status) status.textContent = 'Error loading audio.';
			}
		});

		colorPicker.addEventListener('input', (e) => {
			const color = (e.target as HTMLInputElement).value;
			this.targetColor.set(color);
			document.documentElement.style.setProperty('--primary', color);
		});

		volumeSlider.addEventListener('input', (e) => {
			this.gainNode.gain.value = parseFloat((e.target as HTMLInputElement).value);
		});

		minimizeBtn.addEventListener('click', () => {
			controlsPanel?.classList.toggle('minimized');
		});

		window.addEventListener('resize', () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		});
	}

	private playAudio(buffer: AudioBuffer) {
		if (this.audioSource) {
			this.audioSource.stop();
		}

		this.audioSource = this.audioContext.createBufferSource();
		this.audioSource.buffer = buffer;

		this.audioSource.connect(this.analyser);
		this.analyser.connect(this.gainNode);
		this.gainNode.connect(this.audioContext.destination);

		this.audioSource.start(0);
		this.isPlaying = true;

		if (this.audioContext.state === 'suspended') {
			this.audioContext.resume();
		}
	}

	private animate() {
		requestAnimationFrame(() => this.animate());

		this.controls.update();

		this.curColor.lerp(this.targetColor, 0.05);

		if (this.isPlaying) {
			this.analyser.getByteFrequencyData(this.dataArray);
		}

		this.bars.forEach((bar, i) => {
			const freqIndex = Math.floor((i / this.bars.length) * this.dataArray.length * 0.5);
			const value = this.dataArray[freqIndex] || 0;

			const targetScale = this.isPlaying ? (value / 255) * 15 + 0.1 : 0.5 + Math.sin(Date.now() * 0.001 + i * 0.1) * 0.2;

			bar.scale.y += (targetScale - bar.scale.y) * 0.2;
			bar.position.y = bar.scale.y / 2;

			const material = bar.material as THREE.MeshStandardMaterial;

			const hueShift = (i / this.bars.length) * 0.2;
			const barColor = this.curColor.clone();
			const hsl = { h: 0, s: 0, l: 0 };
			barColor.getHSL(hsl);
			barColor.setHSL((hsl.h + hueShift) % 1, hsl.s, hsl.l + (value / 255) * 0.2);

			material.color.copy(barColor);
			material.emissive.copy(barColor);
			material.emissiveIntensity = (value / 255) * 0.8;
		});

		this.renderer.render(this.scene, this.camera);
	}
}

new Visualizer();
