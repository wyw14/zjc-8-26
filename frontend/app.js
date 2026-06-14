const { createApp, ref, onMounted, computed } = Vue;

const API_BASE = 'http://localhost:3126/api';

createApp({
  setup() {
    const isLoggedIn = ref(false);
    const user = ref(null);
    const token = ref(null);

    const loginForm = ref({ username: '', password: '' });
    const loginLoading = ref(false);
    const loginError = ref('');

    const dreams = ref([]);
    const randomDream = ref(null);
    const monthlyStats = ref({ count: 0, avgLucidity: 0 });

    const now = new Date();
    const selectedYear = ref(now.getFullYear());
    const selectedMonth = ref(now.getMonth() + 1);
    const yearOptions = computed(() => {
      const current = new Date().getFullYear();
      const years = [];
      for (let y = current - 5; y <= current; y++) {
        years.push(y);
      }
      return years;
    });

    const newDream = ref({
      content: '',
      lucidity: 3,
      date: new Date().toISOString().split('T')[0]
    });

    const isPlaying = ref(false);
    const showNoisePanel = ref(false);
    const currentNoiseType = ref('white');
    const currentVolume = ref(0.05);
    const presets = ref([]);
    const newPresetName = ref('');
    const newPresetAutoPlay = ref(false);
    const noiseTypes = [
      { value: 'white', label: '白噪音', icon: '🌫️' },
      { value: 'pink', label: '粉噪音', icon: '🌸' },
      { value: 'brown', label: '棕噪音', icon: '🌰' },
      { value: 'rain', label: '雨声', icon: '🌧️' },
      { value: 'waves', label: '海浪', icon: '🌊' }
    ];
    let audioContext = null;
    let noiseNode = null;
    let gainNode = null;
    let filterNode = null;
    let activeNoiseType = null;

    function getToken() {
      return localStorage.getItem('dream_token');
    }

    function saveToken(t) {
      localStorage.setItem('dream_token', t);
      token.value = t;
    }

    function clearToken() {
      localStorage.removeItem('dream_token');
      token.value = null;
    }

    function saveUser(u) {
      localStorage.setItem('dream_user', JSON.stringify(u));
      user.value = u;
    }

    function loadUser() {
      const saved = localStorage.getItem('dream_user');
      if (saved) {
        user.value = JSON.parse(saved);
        isLoggedIn.value = true;
      }
    }

    async function apiRequest(url, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...options.headers };
      const t = getToken();
      if (t) {
        headers['Authorization'] = `Bearer ${t}`;
      }

      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers
      });

      if (response.status === 401 || response.status === 403) {
        clearToken();
        isLoggedIn.value = false;
        user.value = null;
        throw new Error('未登录');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '请求失败');
      }
      return data;
    }

    async function handleLogin() {
      if (!loginForm.value.username || !loginForm.value.password) {
        loginError.value = '请输入用户名和密码';
        return;
      }

      loginLoading.value = true;
      loginError.value = '';

      try {
        const data = await apiRequest('/login', {
          method: 'POST',
          body: JSON.stringify(loginForm.value)
        });

        saveToken(data.token);
        saveUser(data.user);
        isLoggedIn.value = true;
        loadData();
      } catch (e) {
        loginError.value = e.message;
      } finally {
        loginLoading.value = false;
      }
    }

    function handleLogout() {
      clearToken();
      stopWhiteNoise();
      isLoggedIn.value = false;
      user.value = null;
      dreams.value = [];
      randomDream.value = null;
    }

    async function fetchDreams() {
      try {
        const data = await apiRequest('/dreams');
        dreams.value = data;
      } catch (e) {
        console.error('获取梦境列表失败', e);
      }
    }

    async function fetchRandomDream() {
      try {
        const data = await apiRequest('/dreams/random');
        randomDream.value = data;
        if (!isPlaying.value) {
          startWhiteNoise();
          setTimeout(() => {
            stopWhiteNoise();
          }, 12000);
        }
      } catch (e) {
        alert(e.message);
      }
    }

    async function fetchMonthlyStats() {
      try {
        const data = await apiRequest(`/stats/monthly?year=${selectedYear.value}&month=${selectedMonth.value}`);
        monthlyStats.value = data;
      } catch (e) {
        console.error('获取月度统计失败', e);
      }
    }

    function onMonthChange() {
      fetchMonthlyStats();
    }

    async function addDream() {
      if (!newDream.value.content.trim()) {
        alert('请输入梦境内容');
        return;
      }

      try {
        await apiRequest('/dreams', {
          method: 'POST',
          body: JSON.stringify(newDream.value)
        });

        newDream.value = {
          content: '',
          lucidity: 3,
          date: new Date().toISOString().split('T')[0]
        };

        loadData();
      } catch (e) {
        alert(e.message);
      }
    }

    function loadData() {
      fetchDreams();
      fetchMonthlyStats();
    }

    function generateNoiseBuffer(type) {
      const bufferSize = 2 * audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const output = buffer.getChannelData(0);
      const sampleRate = audioContext.sampleRate;

      switch (type) {
        case 'white':
          for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
          }
          break;
        case 'pink': {
          let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            output[i] *= 0.11;
            b6 = white * 0.115926;
          }
          break;
        }
        case 'brown': {
          let lastOut = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + 0.02 * white) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
          }
          break;
        }
        case 'rain': {
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            const drop = Math.random() < 0.001 ? (Math.random() * 0.5) : 0;
            output[i] = white * 0.3 + drop;
          }
          break;
        }
        case 'waves': {
          for (let i = 0; i < bufferSize; i++) {
            const t = i / sampleRate;
            const wave = Math.sin(2 * Math.PI * 0.1 * t) * 0.3 + Math.sin(2 * Math.PI * 0.05 * t) * 0.2;
            const white = Math.random() * 2 - 1;
            output[i] = wave * 0.2 + white * 0.15;
          }
          break;
        }
        default:
          for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
          }
      }
      return buffer;
    }

    function createWhiteNoise() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      createNoiseNodes();
    }

    function createNoiseNodes(volumeOverride = null) {
      const noiseBuffer = generateNoiseBuffer(currentNoiseType.value);
      noiseNode = audioContext.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;

      gainNode = audioContext.createGain();
      const vol = volumeOverride !== null ? volumeOverride : currentVolume.value;
      gainNode.gain.value = vol;

      filterNode = audioContext.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.value = getFilterFrequency(currentNoiseType.value);

      noiseNode.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      noiseNode.start();
      activeNoiseType = currentNoiseType.value;
    }

    function getFilterFrequency(type) {
      switch (type) {
        case 'white': return 1000;
        case 'pink': return 4000;
        case 'brown': return 500;
        case 'rain': return 3000;
        case 'waves': return 800;
        default: return 1000;
      }
    }

    function updateNoiseType() {
      if (noiseNode) {
        noiseNode.stop();
        noiseNode.disconnect();
      }
      if (filterNode) {
        filterNode.disconnect();
      }
      const vol = isPlaying.value ? null : 0;
      createNoiseNodes(vol);
    }

    function toggleWhiteNoise() {
      if (isPlaying.value) {
        stopWhiteNoise();
      } else {
        startWhiteNoise();
      }
    }

    function toggleNoisePanel() {
      showNoisePanel.value = !showNoisePanel.value;
    }

    function startWhiteNoise() {
      if (!audioContext) {
        createWhiteNoise();
      } else {
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        if (activeNoiseType !== currentNoiseType.value) {
          updateNoiseType();
        }
        if (gainNode) {
          gainNode.gain.setValueAtTime(currentVolume.value, audioContext.currentTime);
        }
      }
      isPlaying.value = true;
    }

    function stopWhiteNoise() {
      if (gainNode && audioContext) {
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      }
      isPlaying.value = false;
    }

    function handleVolumeChange() {
      if (gainNode && audioContext && isPlaying.value) {
        gainNode.gain.setValueAtTime(currentVolume.value, audioContext.currentTime);
      }
    }

    function handleNoiseTypeChange() {
      if (audioContext) {
        updateNoiseType();
      }
    }

    function savePreset() {
      if (!newPresetName.value.trim()) {
        alert('请输入预设名称');
        return;
      }
      const exists = presets.value.some(p => p.name === newPresetName.value.trim());
      if (exists) {
        alert('该预设名称已存在');
        return;
      }
      const preset = {
        id: Date.now(),
        name: newPresetName.value.trim(),
        noiseType: currentNoiseType.value,
        volume: currentVolume.value,
        autoPlay: newPresetAutoPlay.value,
        createdAt: new Date().toISOString()
      };
      presets.value.push(preset);
      savePresetsToStorage();
      newPresetName.value = '';
      newPresetAutoPlay.value = false;
    }

    function applyPreset(preset) {
      currentNoiseType.value = preset.noiseType;
      currentVolume.value = preset.volume;
      if (preset.autoPlay) {
        if (!isPlaying.value) {
          startWhiteNoise();
        } else {
          updateNoiseType();
          handleVolumeChange();
        }
      } else {
        if (audioContext) {
          if (activeNoiseType !== preset.noiseType) {
            updateNoiseType();
          }
          if (isPlaying.value) {
            handleVolumeChange();
          } else if (gainNode) {
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
          }
        }
      }
    }

    function deletePreset(id) {
      if (confirm('确定要删除这个预设吗？')) {
        presets.value = presets.value.filter(p => p.id !== id);
        savePresetsToStorage();
      }
    }

    function savePresetsToStorage() {
      localStorage.setItem('noise_presets', JSON.stringify(presets.value));
    }

    function loadPresetsFromStorage() {
      const saved = localStorage.getItem('noise_presets');
      if (saved) {
        presets.value = JSON.parse(saved);
      } else {
        presets.value = [
          {
            id: 1,
            name: '深夜记录',
            noiseType: 'brown',
            volume: 0.03,
            autoPlay: true,
            createdAt: new Date().toISOString()
          },
          {
            id: 2,
            name: '随机回忆',
            noiseType: 'waves',
            volume: 0.04,
            autoPlay: false,
            createdAt: new Date().toISOString()
          },
          {
            id: 3,
            name: '专注创作',
            noiseType: 'pink',
            volume: 0.05,
            autoPlay: true,
            createdAt: new Date().toISOString()
          }
        ];
        savePresetsToStorage();
      }
    }

    function getNoiseTypeLabel(value) {
      const type = noiseTypes.find(t => t.value === value);
      return type ? type.label : value;
    }

    function getNoiseTypeIcon(value) {
      const type = noiseTypes.find(t => t.value === value);
      return type ? type.icon : '🔊';
    }

    onMounted(() => {
      loadUser();
      loadPresetsFromStorage();
      if (isLoggedIn.value) {
        loadData();
      }
    });

    return {
      isLoggedIn,
      user,
      loginForm,
      loginLoading,
      loginError,
      handleLogin,
      handleLogout,
      dreams,
      randomDream,
      monthlyStats,
      newDream,
      fetchRandomDream,
      addDream,
      isPlaying,
      toggleWhiteNoise,
      selectedYear,
      selectedMonth,
      yearOptions,
      onMonthChange,
      showNoisePanel,
      toggleNoisePanel,
      currentNoiseType,
      currentVolume,
      noiseTypes,
      presets,
      newPresetName,
      newPresetAutoPlay,
      handleVolumeChange,
      handleNoiseTypeChange,
      savePreset,
      applyPreset,
      deletePreset,
      getNoiseTypeLabel,
      getNoiseTypeIcon
    };
  }
}).mount('#app');
