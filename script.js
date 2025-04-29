        // Main variables
        let pageSequence = [];
        let frames = [];
        let frameCount = 3;
        let currentPageIndex = -1;
        let stats = { hits: 0, faults: 0 };
        let algorithm = "fifo";
        let running = false;
        let timer = null;
        let speed = 500;
        let soundEnabled = true;
        let algorithm_state = {
            fifo: { pointer: 0 },
            lru: { counter: 0, timestamps: {} },
            clock: { pointer: 0, referenced: {} },
            nfu: { counters: {} },
            secondChance: { pointer: 0, secondChance: {} },
            workingSet: { timestamps: {}, windowSize: 3 }
        };
        
        // Algorithm info
        const algorithmInfo = {
            fifo: {
                description: "First-In-First-Out (FIFO) replaces the page that has been in memory the longest, regardless of usage.",
                pros: ["Simple to implement", "Low overhead", "No need to track page usage"],
                cons: ["Does not consider page usage frequency", "Can lead to Belady's Anomaly", "May remove frequently used pages"],
                example: "For the sequence [1,2,3,4,1,2] with 3 frames, FIFO would replace page 1 when page 4 arrives, even though page 1 will be needed soon.",
                code: `function fifo(page) {
    if (frames.includes(page)) {
        return "hit";
    }
    if (frames.length < frameCount) {
        frames.push(page);
        return "fault";
    }
    frames[algorithm_state.fifo.pointer] = page;
    algorithm_state.fifo.pointer = (algorithm_state.fifo.pointer + 1) % frameCount;
    return "fault";
}`
            },
            lru: {
                description: "Least Recently Used (LRU) replaces the page that hasn't been accessed for the longest time.",
                pros: ["Better real-world performance than FIFO", "Accounts for temporal locality", "Adapts to changing access patterns"],
                cons: ["Higher overhead due to timestamp tracking", "Difficult to implement efficiently in hardware", "Can still perform poorly with certain access patterns"],
                example: "For the sequence [1,2,3,4,1,2] with 3 frames, LRU would replace page 3 when page 4 arrives because pages 1 and 2 were accessed more recently.",
                code: `function lru(page) {
    algorithm_state.lru.counter++;
    if (frames.includes(page)) {
        algorithm_state.lru.timestamps[page] = algorithm_state.lru.counter;
        return "hit";
    }
    if (frames.length < frameCount) {
        frames.push(page);
        algorithm_state.lru.timestamps[page] = algorithm_state.lru.counter;
        return "fault";
    }
    let leastRecentPage = frames[0];
    for (const frame of frames) {
        if (algorithm_state.lru.timestamps[frame] < 
            algorithm_state.lru.timestamps[leastRecentPage]) {
            leastRecentPage = frame;
        }
    }
    const index = frames.indexOf(leastRecentPage);
    frames[index] = page;
    algorithm_state.lru.timestamps[page] = algorithm_state.lru.counter;
    return "fault";
}`
            },
            optimal: {
                description: "Optimal (Belady's) algorithm replaces the page that will not be used for the longest time in the future.",
                pros: ["Theoretically optimal - lowest possible page fault rate", "Useful as a benchmark", "Immune to Belady's Anomaly"],
                cons: ["Requires knowledge of future page references", "Impractical for real systems", "Computationally intensive to simulate"],
                example: "For the sequence [1,2,3,4,1,2] with 3 frames, Optimal would replace page 3 when page 4 arrives because pages 1 and 2 will be needed sooner than page 3.",
                code: `function optimal(page) {
    if (frames.includes(page)) {
        return "hit";
    }
    if (frames.length < frameCount) {
        frames.push(page);
        return "fault";
    }
    
    // Find page that will not be used for the longest time
    let farthestPage = -1;
    let farthestDistance = -1;
    
    for (const frame of frames) {
        let nextUseIndex = pageSequence.findIndex(
            (p, i) => i > currentPageIndex && p === frame
        );
        
        if (nextUseIndex === -1) {
            // Page never used again, replace it
            farthestPage = frame;
            break;
        }
        
        const distance = nextUseIndex - currentPageIndex;
        if (distance > farthestDistance) {
            farthestDistance = distance;
            farthestPage = frame;
        }
    }
    
    const index = frames.indexOf(farthestPage);
    frames[index] = page;
    return "fault";
}`
            },
            clock: {
                description: "Clock algorithm uses a circular buffer and a reference bit to approximate LRU with lower overhead.",
                pros: ["Lower overhead than LRU", "Reasonable performance", "Easier hardware implementation"],
                cons: ["Not as effective as LRU", "Extra space for reference bits", "Still needs some tracking overhead"],
                example: "When a page fault occurs, the algorithm moves a clock hand and checks each page's reference bit. If the bit is 0, replace the page; if 1, set to 0 and move on.",
                code: `function clock(page) {
    if (frames.includes(page)) {
        algorithm_state.clock.referenced[page] = 1;
        return "hit";
    }
    
    if (frames.length < frameCount) {
        frames.push(page);
        algorithm_state.clock.referenced[page] = 1;
        return "fault";
    }
    
    // Find a page to replace using the clock algorithm
    while (true) {
        const current = frames[algorithm_state.clock.pointer];
        if (algorithm_state.clock.referenced[current] === 0) {
            frames[algorithm_state.clock.pointer] = page;
            algorithm_state.clock.referenced[page] = 1;
            algorithm_state.clock.pointer = 
                (algorithm_state.clock.pointer + 1) % frameCount;
            return "fault";
        }
        algorithm_state.clock.referenced[current] = 0;
        algorithm_state.clock.pointer = 
            (algorithm_state.clock.pointer + 1) % frameCount;
    }
}`
            },
            nfu: {
                description: "Not Frequently Used (NFU) tracks how often each page is referenced and replaces the least frequently used.",
                pros: ["Accounts for frequency of use", "Simple counters implementation", "Good for repeated access patterns"],
                cons: ["Doesn't account for temporal locality", "Old pages can accumulate high counts", "Static access patterns cause inefficiency"],
                example: "Each page has a counter that increases when it's accessed. The page with the lowest counter is replaced on a fault.",
                code: `function nfu(page) {
    if (frames.includes(page)) {
        algorithm_state.nfu.counters[page]++;
        return "hit";
    }
    
    if (frames.length < frameCount) {
        frames.push(page);
        algorithm_state.nfu.counters[page] = 1;
        return "fault";
    }
    
    let leastFrequent = frames[0];
    for (const frame of frames) {
        if (algorithm_state.nfu.counters[frame] < 
            algorithm_state.nfu.counters[leastFrequent]) {
            leastFrequent = frame;
        }
    }
    
    const index = frames.indexOf(leastFrequent);
    frames[index] = page;
    algorithm_state.nfu.counters[page] = 1;
    return "fault";
}`
            },
            secondChance: {
                description: "Second Chance is an enhancement of FIFO that gives pages a second chance before replacement.",
                pros: ["Better than FIFO", "Less overhead than LRU", "Simple to implement"],
                cons: ["Not as effective as full LRU", "Can still perform poorly with certain access patterns"],
                example: "Works like FIFO but before replacing a page, checks its reference bit. If 1, sets to 0 and moves on; if 0, replaces it.",
                code: `function secondChance(page) {
    if (frames.includes(page)) {
        algorithm_state.secondChance.secondChance[page] = 1;
        return "hit";
    }
    
    if (frames.length < frameCount) {
        frames.push(page);
        algorithm_state.secondChance.secondChance[page] = 0;
        return "fault";
    }
    
    while (true) {
        const current = frames[algorithm_state.secondChance.pointer];
        if (algorithm_state.secondChance.secondChance[current] === 0) {
            frames[algorithm_state.secondChance.pointer] = page;
            algorithm_state.secondChance.secondChance[page] = 0;
            algorithm_state.secondChance.pointer = 
                (algorithm_state.secondChance.pointer + 1) % frameCount;
            return "fault";
        }
        algorithm_state.secondChance.secondChance[current] = 0;
        algorithm_state.secondChance.pointer = 
            (algorithm_state.secondChance.pointer + 1) % frameCount;
    }
}`
            },
            workingSet: {
                description: "Working Set tracks pages used within a recent time window, aiming to keep the working set in memory.",
                pros: ["Accounts for temporal locality", "Adapts to program phases", "Good for real-world workloads"],
                cons: ["High overhead to track timestamps", "Window size is a critical parameter", "Difficult to implement in hardware"],
                example: "The working set is defined by pages accessed in the last T time units. Pages not in the working set are candidates for replacement.",
                code: `function workingSet(page) {
    const currentTime = ++algorithm_state.workingSet.timestamps.time;
    
    if (frames.includes(page)) {
        algorithm_state.workingSet.timestamps[page] = currentTime;
        return "hit";
    }
    
    if (frames.length < frameCount) {
        frames.push(page);
        algorithm_state.workingSet.timestamps[page] = currentTime;
        return "fault";
    }
    
    // Find the page that's been outside the working set for longest
    let oldestPage = frames[0];
    let oldestTime = algorithm_state.workingSet.timestamps[oldestPage];
    
    for (const frame of frames) {
        const timestamp = algorithm_state.workingSet.timestamps[frame];
        if (timestamp < oldestTime) {
            oldestTime = timestamp;
            oldestPage = frame;
        }
    }
    
    const index = frames.indexOf(oldestPage);
    frames[index] = page;
    algorithm_state.workingSet.timestamps[page] = currentTime;
    return "fault";
}`
            }
        };
        
        // DOM elements
        const memoryFramesEl = document.getElementById('memoryFrames');
        const pageSequenceEl = document.getElementById('pageSequenceDisplay');
        const faultCountEl = document.getElementById('faultCount');
        const hitCountEl = document.getElementById('hitCount');
        const hitRatioEl = document.getElementById('hitRatio');
        const faultRateEl = document.getElementById('faultRate');
        const avgAccessTimeEl = document.getElementById('avgAccessTime');
        const algorithmInfoEl = document.getElementById('algorithmInfo');
        const executionLogEl = document.getElementById('executionLog');
        const algorithmDetailsEl = document.getElementById('algorithmDetails');
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            initUI();
            setupEventListeners();
            updateAlgorithmInfo();
            resetSimulation();
        
            // ADD THIS RIGHT HERE ▼ (Point 5)
            document.getElementById('advancedInfoBtn').addEventListener('click', function() {
                const info = algorithmInfo[algorithm] || algorithmInfo.fifo;
                document.getElementById('algorithmModalTitle').textContent = `${algorithm.toUpperCase()} Algorithm Details`;
                document.getElementById('algorithmModalDesc').innerHTML = `<p>${info.description}</p>`;
                document.getElementById('algorithmModalCode').textContent = info.code;
                document.getElementById('algorithmModal').style.display = 'flex';
            });
            // ▲ Add the above code block here
        
            if (!localStorage.getItem('tutorialShown')) {
                showTutorial();
                localStorage.setItem('tutorialShown', 'true');
            }
        });


        // Function to print the complete page report

        
        // Initialize UI components
        function initUI() {
            // Initialize chart
            const ctx = document.getElementById('statsChart').getContext('2d');
            window.statsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Hit Ratio',
                        data: [],
                        borderColor: '#10b981',
                        tension: 0.1
                    }, {
                        label: 'Fault Ratio',
                        data: [],
                        borderColor: '#ef4444',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100
                        }
                    }
                }
            });
            
            // Initialize comparison chart
            const compCtx = document.getElementById('comparisonChart').getContext('2d');
            window.comparisonChart = new Chart(compCtx, {
                type: 'bar',
                data: {
                    labels: ['FIFO', 'LRU', 'Optimal', 'Clock', 'NFU', 'Second Chance', 'Working Set'],
                    datasets: [{
                        label: 'Page Faults',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(239, 68, 68, 0.7)',
                            'rgba(16, 185, 129, 0.7)',
                            'rgba(79, 70, 229, 0.7)',
                            'rgba(245, 158, 11, 0.7)',
                            'rgba(59, 130, 246, 0.7)',
                            'rgba(139, 92, 246, 0.7)',
                            'rgba(20, 184, 166, 0.7)'
                        ]
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true
                }
            });
            
            // Initialize modal comparison chart
            const modalCompCtx = document.getElementById('modalComparisonChart').getContext('2d');
            window.modalComparisonChart = new Chart(modalCompCtx, {
                type: 'bar',
                data: {
                    labels: ['FIFO', 'LRU', 'Optimal', 'Clock'],
                    datasets: [{
                        label: 'Page Faults',
                        data: [0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(239, 68, 68, 0.7)',
                            'rgba(16, 185, 129, 0.7)',
                            'rgba(79, 70, 229, 0.7)',
                            'rgba(245, 158, 11, 0.7)'
                        ]
                    }, {
                        label: 'Hit Rate (%)',
                        data: [0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(239, 68, 68, 0.4)',
                            'rgba(16, 185, 129, 0.4)',
                            'rgba(79, 70, 229, 0.4)',
                            'rgba(245, 158, 11, 0.4)'
                        ]
                    }]
                },
                options: {
                    responsive: true
                }
            });
            
            // Set up tutorial content
            setupTutorial();
        }
        
        // Set up event listeners
        function setupEventListeners() {
            // Button event listeners
            document.getElementById('btnRandom').addEventListener('click', generateRandomSequence);
            document.getElementById('btnStart').addEventListener('click', startSimulation);
            document.getElementById('btnStep').addEventListener('click', stepSimulation);
            document.getElementById('btnPause').addEventListener('click', pauseSimulation);
            document.getElementById('btnReset').addEventListener('click', resetSimulation);
            document.getElementById('soundToggle').addEventListener('click', toggleSound);
            document.getElementById('exportBtn').addEventListener('click', exportVisualization);
            document.getElementById('compareBtn').addEventListener('click', showComparisonView);
            document.getElementById('helpBtn').addEventListener('click', showTutorial);
            document.getElementById('advancedInfoBtn').addEventListener('click', toggleAlgorithmDetails);
            document.getElementById('saveStateBtn').addEventListener('click', saveState);
            document.getElementById('loadStateBtn').addEventListener('click', loadState);
            document.getElementById('bookmarkBtn').addEventListener('click', addBookmark);
            document.getElementById('showDetailsBtn').addEventListener('click', toggleStepDetails);
            
            // View mode buttons
            document.getElementById('viewModeStandard').addEventListener('click', () => setViewMode('standard'));
            document.getElementById('viewModeDetailed').addEventListener('click', () => setViewMode('detailed'));
            document.getElementById('viewModeCompare').addEventListener('click', () => setViewMode('compare'));
            
            // Log filter buttons
            document.getElementById('filterAll').addEventListener('click', () => filterLog('all'));
            document.getElementById('filterFaults').addEventListener('click', () => filterLog('faults'));
            document.getElementById('filterHits').addEventListener('click', () => filterLog('hits'));
            document.getElementById('clearLog').addEventListener('click', clearLog);
            
            // Tutorial modal buttons
            document.getElementById('tutorialNext').addEventListener('click', tutorialNext);
            document.getElementById('tutorialPrev').addEventListener('click', tutorialPrev);
            document.getElementById('tutorialClose').addEventListener('click', closeTutorial);
            
            // Compare modal button
            document.getElementById('compareModalClose').addEventListener('click', closeCompareModal);
            
            // Export modal buttons
            document.getElementById('cancelExport').addEventListener('click', closeExportModal);
            document.getElementById('confirmExport').addEventListener('click', downloadExport);
            
            // Algorithm modal button
            document.getElementById('algorithmModalClose').addEventListener('click', closeAlgorithmModal);
            
            // Theme toggle
            document.getElementById('themeToggle').addEventListener('click', toggleTheme);
            
            // Preset dropdown
            document.getElementById('presets').addEventListener('change', function() {
                if (this.value) {
                    document.getElementById('pageSequence').value = this.value;
                }
            });
            
            // Algorithm change
            document.getElementById('algorithm').addEventListener('change', function() {
                algorithm = this.value;
                updateAlgorithmInfo();
            });
            
            // Tab functionality for algorithm details
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabSet = this.getAttribute('data-tab') ? 'data-tab' : 'data-modal-tab';
                    const contentSet = tabSet === 'data-tab' ? 'data-content' : 'data-modal-content';
                    
                    // Remove active class from all tabs in this set
                    document.querySelectorAll(`[${tabSet}]`).forEach(t => {
                        t.classList.remove('active');
                    });
                    
                    // Add active class to clicked tab
                    this.classList.add('active');
                    
                    // Hide all tab content
                    document.querySelectorAll(`[${contentSet}]`).forEach(c => {
                        c.classList.remove('active');
                    });
                    
                    // Show the corresponding content
                    const contentId = this.getAttribute(tabSet);
                    document.querySelector(`[${contentSet}="${contentId}"]`).classList.add('active');
                });
            });
            document.querySelectorAll('[data-modal-tab]').forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabSet = 'data-modal-tab';
                    const contentSet = 'data-modal-content';
                    
                    document.querySelectorAll(`[${tabSet}]`).forEach(t => {
                        t.classList.remove('active');
                    });
                    
                    this.classList.add('active');
                    
                    document.querySelectorAll(`[${contentSet}]`).forEach(c => {
                        c.classList.remove('active');
                    });
                    
                    const contentId = this.getAttribute(tabSet);
                    document.querySelector(`[${contentSet}="${contentId}"]`).classList.add('active');
                });
            });
        }
        
        // Function to generate a random page sequence
        function generateRandomSequence() {
            const length = Math.floor(Math.random() * 10) + 10; // 10-20 pages
            const maxPage = 8;
            let sequence = [];
            
            // Generate with some locality of reference
            for (let i = 0; i < length; i++) {
                // 70% chance to reference a recently used page
                if (i > 3 && Math.random() < 0.7) {
                    const recentIndex = Math.floor(Math.random() * 3);
                    sequence.push(sequence[i - 1 - recentIndex]);
                } else {
                    sequence.push(Math.floor(Math.random() * maxPage) + 1);
                }
            }
            
            document.getElementById('pageSequence').value = sequence.join(',');
        }
        
        // Start the simulation
        function startSimulation() {
            if (running) return;
            
            // Parse the page sequence
            const input = document.getElementById('pageSequence').value;
            pageSequence = input.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
            
            if (pageSequence.length === 0) {
                addLog("Error: Please enter a valid page sequence", "error");
                return;
            }
            
            // Get frame count
            frameCount = parseInt(document.getElementById('frameCount').value);
            if (isNaN(frameCount) || frameCount < 1 || frameCount > 10) {
                addLog("Error: Frame count must be between 1 and 10", "error");
                return;
            }
            
            // Get speed
            speed = parseInt(document.getElementById('speed').value);
            
            // Reset simulation state
            resetSimulationState();
            
            // Update UI
            updatePageSequenceDisplay();
            updateFramesDisplay();
            
            // Start the timer
            running = true;
            timer = setInterval(stepSimulation, speed);
            
            // Show chart
            document.getElementById('chartContainer').style.display = 'block';
        }
        
        // Reset the simulation state without updating UI
        function resetSimulationState() {
            frames = [];
            currentPageIndex = -1;
            stats = { hits: 0, faults: 0 };
            
            // Reset algorithm-specific state
            algorithm_state = {
                fifo: { pointer: 0 },
                lru: { counter: 0, timestamps: {} },
                clock: { pointer: 0, referenced: {} },
                nfu: { counters: {} },
                secondChance: { pointer: 0, secondChance: {} },
                workingSet: { timestamps: { time: 0 }, windowSize: 3 }
            };
        }
        
        // Step through the simulation
        function stepSimulation() {
            if (currentPageIndex >= pageSequence.length - 1) {
                pauseSimulation();
                addLog("Simulation complete", "info");
                return;
            }
            
            currentPageIndex++;
            const page = pageSequence[currentPageIndex];
            let result;
            
            // Apply the selected algorithm
            switch (algorithm) {
                case "fifo": result = fifo(page); break;
                case "lru": result = lru(page); break;
                case "optimal": result = optimal(page); break;
                case "clock": result = clock(page); break;
                case "nfu": result = nfu(page); break;
                case "secondChance": result = secondChance(page); break;
                case "workingSet": result = workingSet(page); break;
                default: result = fifo(page);
            }
            
            // Update stats
            if (result === "hit") {
                stats.hits++;
                if (soundEnabled) document.getElementById('hitSound').play();
            } else {
                stats.faults++;
                if (soundEnabled) document.getElementById('faultSound').play();
            }
            
            // Update UI
            updatePageSequenceDisplay();
            updateFramesDisplay();
            updateStats();
            addLog(`Page ${page}: ${result.toUpperCase()}`, result);
            updateCharts();
            updateStepDetails(page, result);
            
            // Update algorithm state display
            updateAlgorithmStateDisplay();
        }
        
        // Pause the simulation
        function pauseSimulation() {
            if (!running) return;
            clearInterval(timer);
            running = false;
        }
        
        // Reset the simulation
        function resetSimulation() {
            pauseSimulation();
            resetSimulationState();
            
            // Reset UI
            memoryFramesEl.innerHTML = "";
            pageSequenceEl.innerHTML = "";
            faultCountEl.textContent = "0";
            hitCountEl.textContent = "0";
            hitRatioEl.textContent = "0%";
            faultRateEl.textContent = "0%";
            avgAccessTimeEl.textContent = "0ms";
            clearLog();
            
            // Reset chart
            window.statsChart.data.labels = [];
            window.statsChart.data.datasets[0].data = [];
            window.statsChart.data.datasets[1].data = [];
            window.statsChart.update();
            
            // Setup page sequence display
            const input = document.getElementById('pageSequence').value;
            if (input) {
                pageSequence = input.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
                updatePageSequenceDisplay();
            }
        }
        
        // Update the page sequence display
        function updatePageSequenceDisplay() {
            pageSequenceEl.innerHTML = "";
            
            pageSequence.forEach((page, index) => {
                const div = document.createElement('div');
                div.classList.add('w-8', 'h-8', 'flex', 'items-center', 'justify-center', 'rounded');
                div.textContent = page;
                
                if (index === currentPageIndex) {
                    div.classList.add('current-page', 'frame-pulse');
                    
                    // If frame contains this page, it's a hit, otherwise a fault
                    if (frames.includes(page)) {
                        div.classList.add('page-hit');
                    } else {
                        div.classList.add('page-fault');
                    }
                } else {
                    div.classList.add('bg-gray-700');
                }
                
                pageSequenceEl.appendChild(div);
            });
            
            // Do the same for detailed view
            if (document.getElementById('detailedPageSequence')) {
                const detailedSeq = document.getElementById('detailedPageSequence');
                detailedSeq.innerHTML = "";
                
                pageSequence.forEach((page, index) => {
                    const div = document.createElement('div');
                    div.classList.add('w-8', 'h-8', 'flex', 'items-center', 'justify-center', 'rounded');
                    div.textContent = page;
                    
                    if (index === currentPageIndex) {
                        div.classList.add('current-page', 'frame-pulse');
                        
                        // If frame contains this page, it's a hit, otherwise a fault
                        if (frames.includes(page)) {
                            div.classList.add('page-hit');
                        } else {
                            div.classList.add('page-fault');
                        }
                    } else if (index < currentPageIndex) {
                        // For past pages, show if they were hits or faults
                        if (frames.includes(page)) {
                            div.classList.add('page-hit');
                        } else {
                            div.classList.add('page-fault');
                        }
                    } else {
                        // Future pages
                        div.classList.add('bg-gray-700');
                    }
                    
                    detailedSeq.appendChild(div);
                });
            }
        }
        
        // Update the memory frames display
        function updateFramesDisplay() {
            memoryFramesEl.innerHTML = "";
            
            // Create frame elements
            for (let i = 0; i < frameCount; i++) {
                const frame = document.createElement('div');
                frame.classList.add('w-12', 'h-12', 'flex', 'items-center', 'justify-center', 'rounded', 'bg-gray-800', 'border', 'border-gray-700');
                
                if (i < frames.length) {
                    frame.textContent = frames[i];
                    
                    // Add algorithm-specific decorations
                    if (algorithm === "lru") {
                        const counter = document.createElement('div');
                        counter.classList.add('lru-counter');
                        counter.textContent = algorithm_state.lru.timestamps[frames[i]] || 0;
                        frame.appendChild(counter);
                        frame.style.position = 'relative';
                    }
                    
                    if (algorithm === "fifo" && i === algorithm_state.fifo.pointer) {
                        const pointer = document.createElement('div');
                        pointer.classList.add('fifo-position');
                        pointer.textContent = 'F';
                        frame.appendChild(pointer);
                        frame.style.position = 'relative';
                    }
                    
                    if (algorithm === "clock" && i === algorithm_state.clock.pointer) {
                        const pointer = document.createElement('div');
                        pointer.classList.add('fifo-position');
                        pointer.textContent = 'C';
                        frame.appendChild(pointer);
                        frame.style.position = 'relative';
                    }
                }
                
                memoryFramesEl.appendChild(frame);
            }
            
            // Update detailed view if it exists
            if (document.getElementById('detailedMemoryFrames')) {
                const detailedFrames = document.getElementById('detailedMemoryFrames');
                detailedFrames.innerHTML = "";
                
                for (let i = 0; i < frameCount; i++) {
                    const frame = document.createElement('div');
                    frame.classList.add('w-16', 'h-16', 'flex', 'flex-col', 'items-center', 'justify-center', 'rounded', 'bg-gray-800', 'border', 'border-gray-700', 'p-2');
                    
                    if (i < frames.length) {
                        frame.innerHTML = `
                            <div class="text-lg font-bold">${frames[i]}</div>
                            <div class="text-xs mt-1 text-gray-400">
                                ${getFrameDetails(frames[i])}
                            </div>
                        `;
                        
                        // Highlight if this frame contains the current page
                        if (currentPageIndex >= 0 && frames[i] === pageSequence[currentPageIndex]) {
                            frame.classList.add('frame-pulse');
                        }
                    } else {
                        frame.textContent = "Empty";
                    }
                    
                    detailedFrames.appendChild(frame);
                }
            }
        }
        
        // Helper function to get frame details for detailed view
        function getFrameDetails(page) {
            switch (algorithm) {
                case "lru":
                    return `Last used: ${algorithm_state.lru.timestamps[page] || 'N/A'}`;
                case "fifo":
                    return `Loaded at: ${algorithm_state.fifo.pointer === frames.indexOf(page) ? 'Next to replace' : ''}`;
                case "clock":
                    return `Ref bit: ${algorithm_state.clock.referenced[page] || 0}`;
                case "nfu":
                    return `Count: ${algorithm_state.nfu.counters[page] || 0}`;
                case "secondChance":
                    return `Second chance: ${algorithm_state.secondChance.secondChance[page] || 0}`;
                case "workingSet":
                    return `Last used: ${algorithm_state.workingSet.timestamps[page] || 'N/A'}`;
                default:
                    return "";
            }
        }
            // Update statistics display
    function updateStats() {
        faultCountEl.textContent = stats.faults;
        hitCountEl.textContent = stats.hits;
        
        const total = stats.hits + stats.faults;
        const hitRatio = total > 0 ? Math.round((stats.hits / total) * 100) : 0;
        const faultRate = total > 0 ? Math.round((stats.faults / total) * 100) : 0;
        
        hitRatioEl.textContent = `${hitRatio}%`;
        faultRateEl.textContent = `${faultRate}%`;
        
        // Calculate average access time (simplified model)
        const avgTime = total > 0 ? Math.round((stats.hits * 10 + stats.faults * 100) / total) : 0;
        avgAccessTimeEl.textContent = `${avgTime}ms`;
    }

    // Update the charts with current data
    function updateCharts() {
        const total = stats.hits + stats.faults;
        const hitRatio = total > 0 ? Math.round((stats.hits / total) * 100) : 0;
        const faultRate = total > 0 ? Math.round((stats.faults / total) * 100) : 0;
        
        // Update main stats chart
        window.statsChart.data.labels.push(currentPageIndex + 1);
        window.statsChart.data.datasets[0].data.push(hitRatio);
        window.statsChart.data.datasets[1].data.push(faultRate);
        window.statsChart.update();
    }

    // Add a message to the execution log
    function addLog(message, type = "info") {
        const logEntry = document.createElement('div');
        logEntry.classList.add('mb-1');
        
        switch (type) {
            case "error":
                logEntry.classList.add('text-red-400');
                break;
            case "hit":
                logEntry.classList.add('text-green-400');
                break;
            case "fault":
                logEntry.classList.add('text-red-400');
                break;
            default:
                logEntry.classList.add('text-gray-400');
        }
        
        logEntry.textContent = `Step ${currentPageIndex + 1}: ${message}`;
        executionLogEl.appendChild(logEntry);
        executionLogEl.scrollTop = executionLogEl.scrollHeight;
    }

    // Filter the execution log
    function filterLog(filterType) {
        const entries = executionLogEl.querySelectorAll('div');
        entries.forEach(entry => {
            switch (filterType) {
                case "all":
                    entry.style.display = "block";
                    break;
                case "faults":
                    entry.style.display = entry.classList.contains('text-red-400') ? "block" : "none";
                    break;
                case "hits":
                    entry.style.display = entry.classList.contains('text-green-400') ? "block" : "none";
                    break;
            }
        });
    }

    // Clear the execution log
    function clearLog() {
        executionLogEl.innerHTML = "";
    }

    // Update algorithm information display
    function updateAlgorithmInfo() {
        const info = algorithmInfo[algorithm] || algorithmInfo.fifo;
        algorithmInfoEl.textContent = info.description;
        
        // Update the details tabs
        document.querySelector('[data-content="description"]').innerHTML = `<p>${info.description}</p>`;
        document.querySelector('[data-content="pros"]').innerHTML = 
            `<ul class="list-disc pl-5">${info.pros.map(pro => `<li>${pro}</li>`).join('')}</ul>`;
        document.querySelector('[data-content="cons"]').innerHTML = 
            `<ul class="list-disc pl-5">${info.cons.map(con => `<li>${con}</li>`).join('')}</ul>`;
        document.querySelector('[data-content="example"]').innerHTML = `<p>${info.example}</p>`;
        
        // Update modal content
        document.getElementById('algorithmModalDesc').innerHTML = `<p>${info.description}</p>`;
        document.getElementById('algorithmModalCode').textContent = info.code;
    }

    // Toggle algorithm details visibility
    function toggleAlgorithmDetails() {
        algorithmDetailsEl.style.display = algorithmDetailsEl.style.display === 'none' ? 'block' : 'none';
    }

    // Toggle sound effects
    function toggleSound() {
        soundEnabled = !soundEnabled;
        const btn = document.getElementById('soundToggle');
        btn.textContent = soundEnabled ? "🔊 Sound On" : "🔇 Sound Off";
    }

    // Set the view mode (standard, detailed, compare)
    function setViewMode(mode) {
        document.getElementById('standardView').style.display = mode === 'standard' ? 'block' : 'none';
        document.getElementById('detailedView').style.display = mode === 'detailed' ? 'block' : 'none';
        document.getElementById('comparisonView').style.display = mode === 'compare' ? 'block' : 'none';
        
        // Update active button state
        document.getElementById('viewModeStandard').classList.toggle('bg-gray-700', mode === 'standard');
        document.getElementById('viewModeDetailed').classList.toggle('bg-gray-700', mode === 'detailed');
        document.getElementById('viewModeCompare').classList.toggle('bg-gray-700', mode === 'compare');
        
        // Update displays when switching modes
        if (mode === 'detailed' || mode === 'compare') {
            updateFramesDisplay();
            updatePageSequenceDisplay();
        }
    }

    // Show the comparison view with all algorithms
    function showComparisonView() {
        const input = document.getElementById('pageSequence').value;
        const sequence = input.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
        
        if (sequence.length === 0) {
            addLog("Error: Please enter a valid page sequence", "error");
            return;
        }
        
        // Run all algorithms
        const results = {};
        const algorithms = ['fifo', 'lru', 'optimal', 'clock', 'nfu', 'secondChance', 'workingSet'];
        
        algorithms.forEach(algo => {
            // Save current state
            const currentAlgo = algorithm;
            const currentFrames = [...frames];
            const currentIndex = currentPageIndex;
            const currentStats = {...stats};
            const currentState = JSON.parse(JSON.stringify(algorithm_state));
            
            // Run the algorithm
            algorithm = algo;
            resetSimulationState();
            pageSequence = [...sequence];
            
            for (let i = 0; i < pageSequence.length; i++) {
                currentPageIndex = i;
                const page = pageSequence[i];
                
                switch (algorithm) {
                    case "fifo": fifo(page); break;
                    case "lru": lru(page); break;
                    case "optimal": optimal(page); break;
                    case "clock": clock(page); break;
                }
            }
            
            // Save results
            results[algo] = {
                faults: stats.faults,
                hits: stats.hits,
                frames: [...frames],
                hitRate: Math.round((stats.hits / (stats.hits + stats.faults)) * 100) || 0
            };
            
            // Restore state
            algorithm = currentAlgo;
            frames = [...currentFrames];
            currentPageIndex = currentIndex;
            stats = {...currentStats};
            algorithm_state = JSON.parse(JSON.stringify(currentState));
        });
        
        // Update comparison view
        updateComparisonView(results);
        setViewMode('compare');
    }

    // Update the comparison view with results
    function updateComparisonView(results) {
        // Update frames display for each algorithm
        updateAlgorithmFrames('fifo', results.fifo.frames);
        updateAlgorithmFrames('lru', results.lru.frames);
        updateAlgorithmFrames('optimal', results.optimal.frames);
        updateAlgorithmFrames('clock', results.clock.frames);
        
        // Update stats
        document.getElementById('fifoFaults').textContent = results.fifo.faults;
        document.getElementById('lruFaults').textContent = results.lru.faults;
        document.getElementById('optimalFaults').textContent = results.optimal.faults;
        document.getElementById('clockFaults').textContent = results.clock.faults;
        
        document.getElementById('fifoHitRate').textContent = `${results.fifo.hitRate}%`;
        document.getElementById('lruHitRate').textContent = `${results.lru.hitRate}%`;
        document.getElementById('optimalHitRate').textContent = `${results.optimal.hitRate}%`;
        document.getElementById('clockHitRate').textContent = `${results.clock.hitRate}%`;
        
        // Update chart
        window.comparisonChart.data.datasets[0].data = [
            results.fifo.faults,
            results.lru.faults,
            results.optimal.faults,
            results.clock.faults
        ];
        window.comparisonChart.update();
    }

    // Update frames display for a specific algorithm in comparison view
    function updateAlgorithmFrames(algorithm, algoFrames) {
        const container = document.getElementById(`${algorithm}Frames`);
        container.innerHTML = "";
        
        for (let i = 0; i < frameCount; i++) {
            const frame = document.createElement('div');
            frame.classList.add('w-8', 'h-8', 'flex', 'items-center', 'justify-center', 'rounded', 'bg-gray-800', 'border', 'border-gray-700');
            
            if (i < algoFrames.length) {
                frame.textContent = algoFrames[i];
            }
            
            container.appendChild(frame);
        }
    }

    // Page replacement algorithms implementation
    function fifo(page) {
        if (frames.includes(page)) {
            return "hit";
        }
        
        if (frames.length < frameCount) {
            frames.push(page);
            return "fault";
        }
        
        frames[algorithm_state.fifo.pointer] = page;
        algorithm_state.fifo.pointer = (algorithm_state.fifo.pointer + 1) % frameCount;
        return "fault";
    }

    function lru(page) {
        algorithm_state.lru.counter++;
        
        if (frames.includes(page)) {
            algorithm_state.lru.timestamps[page] = algorithm_state.lru.counter;
            return "hit";
        }
        
        if (frames.length < frameCount) {
            frames.push(page);
            algorithm_state.lru.timestamps[page] = algorithm_state.lru.counter;
            return "fault";
        }
        
        let leastRecentPage = frames[0];
        for (const frame of frames) {
            if (algorithm_state.lru.timestamps[frame] < algorithm_state.lru.timestamps[leastRecentPage]) {
                leastRecentPage = frame;
            }
        }
        
        const index = frames.indexOf(leastRecentPage);
        frames[index] = page;
        algorithm_state.lru.timestamps[page] = algorithm_state.lru.counter;
        return "fault";
    }

    function optimal(page) {
        if (frames.includes(page)) {
            return "hit";
        }
        
        if (frames.length < frameCount) {
            frames.push(page);
            return "fault";
        }
        
        // Find page that will not be used for the longest time
        let farthestPage = -1;
        let farthestDistance = -1;
        
        for (const frame of frames) {
            let nextUseIndex = pageSequence.findIndex(
                (p, i) => i > currentPageIndex && p === frame
            );
            
            if (nextUseIndex === -1) {
                // Page never used again, replace it
                farthestPage = frame;
                break;
            }
            
            const distance = nextUseIndex - currentPageIndex;
            if (distance > farthestDistance) {
                farthestDistance = distance;
                farthestPage = frame;
            }
        }
        
        const index = frames.indexOf(farthestPage);
        frames[index] = page;
        return "fault";
    }

    function clock(page) {
        if (frames.includes(page)) {
            algorithm_state.clock.referenced[page] = 1;
            return "hit";
        }
        
        if (frames.length < frameCount) {
            frames.push(page);
            algorithm_state.clock.referenced[page] = 1;
            return "fault";
        }
        
        // Find a page to replace using the clock algorithm
        while (true) {
            const current = frames[algorithm_state.clock.pointer];
            if (algorithm_state.clock.referenced[current] === 0) {
                frames[algorithm_state.clock.pointer] = page;
                algorithm_state.clock.referenced[page] = 1;
                algorithm_state.clock.pointer = (algorithm_state.clock.pointer + 1) % frameCount;
                return "fault";
            }
            algorithm_state.clock.referenced[current] = 0;
            algorithm_state.clock.pointer = (algorithm_state.clock.pointer + 1) % frameCount;
        }
    }

    function nfu(page) {
        if (frames.includes(page)) {
            algorithm_state.nfu.counters[page] = (algorithm_state.nfu.counters[page] || 0) + 1;
            return "hit";
        }
        
        if (frames.length < frameCount) {
            frames.push(page);
            algorithm_state.nfu.counters[page] = 1;
            return "fault";
        }
        
        let leastFrequent = frames[0];
        for (const frame of frames) {
            if ((algorithm_state.nfu.counters[frame] || 0) < (algorithm_state.nfu.counters[leastFrequent] || 0)) {
                leastFrequent = frame;
            }
        }
        
        const index = frames.indexOf(leastFrequent);
        frames[index] = page;
        algorithm_state.nfu.counters[page] = 1;
        return "fault";
    }

    function secondChance(page) {
        if (frames.includes(page)) {
            algorithm_state.secondChance.secondChance[page] = 1;
            return "hit";
        }
        
        if (frames.length < frameCount) {
            frames.push(page);
            algorithm_state.secondChance.secondChance[page] = 0;
            return "fault";
        }
        
        while (true) {
            const current = frames[algorithm_state.secondChance.pointer];
            if (algorithm_state.secondChance.secondChance[current] === 0) {
                frames[algorithm_state.secondChance.pointer] = page;
                algorithm_state.secondChance.secondChance[page] = 0;
                algorithm_state.secondChance.pointer = (algorithm_state.secondChance.pointer + 1) % frameCount;
                return "fault";
            }
            algorithm_state.secondChance.secondChance[current] = 0;
            algorithm_state.secondChance.pointer = (algorithm_state.secondChance.pointer + 1) % frameCount;
        }
    }

    function workingSet(page) {
        const currentTime = ++algorithm_state.workingSet.timestamps.time;
        
        if (frames.includes(page)) {
            algorithm_state.workingSet.timestamps[page] = currentTime;
            return "hit";
        }
        
        if (frames.length < frameCount) {
            frames.push(page);
            algorithm_state.workingSet.timestamps[page] = currentTime;
            return "fault";
        }
        
        // Find the page that's been outside the working set for longest
        let oldestPage = frames[0];
        let oldestTime = algorithm_state.workingSet.timestamps[oldestPage];
        
        for (const frame of frames) {
            const timestamp = algorithm_state.workingSet.timestamps[frame];
            if (timestamp < oldestTime) {
                oldestTime = timestamp;
                oldestPage = frame;
            }
        }
        
        const index = frames.indexOf(oldestPage);
        frames[index] = page;
        algorithm_state.workingSet.timestamps[page] = currentTime;
        return "fault";
    }

    // Update algorithm state display for detailed view
    function updateAlgorithmStateDisplay() {
        const stateEl = document.getElementById('algorithmState');
        if (!stateEl) return;
        
        let stateInfo = "";
        
        switch (algorithm) {
            case "fifo":
                stateInfo = `Pointer: ${algorithm_state.fifo.pointer}`;
                break;
            case "lru":
                stateInfo = `Counter: ${algorithm_state.lru.counter}<br>`;
                stateInfo += `Timestamps: ${JSON.stringify(algorithm_state.lru.timestamps)}`;
                break;
            case "clock":
                stateInfo = `Pointer: ${algorithm_state.clock.pointer}<br>`;
                stateInfo += `Reference bits: ${JSON.stringify(algorithm_state.clock.referenced)}`;
                break;
            case "nfu":
                stateInfo = `Counters: ${JSON.stringify(algorithm_state.nfu.counters)}`;
                break;
            case "secondChance":
                stateInfo = `Pointer: ${algorithm_state.secondChance.pointer}<br>`;
                stateInfo += `Second chance bits: ${JSON.stringify(algorithm_state.secondChance.secondChance)}`;
                break;
            case "workingSet":
                stateInfo = `Current time: ${algorithm_state.workingSet.timestamps.time}<br>`;
                stateInfo += `Timestamps: ${JSON.stringify(algorithm_state.workingSet.timestamps)}`;
                break;
            default:
                stateInfo = "No special state information";
        }
        
        stateEl.innerHTML = stateInfo;
    }

    // Update step details for detailed view
    function updateStepDetails(page, result) {
        const stepDetails = document.getElementById('stepDetailsContent');
        if (!stepDetails) return;
        
        let details = `<strong>Step ${currentPageIndex + 1}:</strong> Page ${page} - ${result.toUpperCase()}<br>`;
        details += `<strong>Frames:</strong> [${frames.join(', ')}]<br>`;
        
        switch (algorithm) {
            case "fifo":
                details += `<strong>FIFO Pointer:</strong> ${algorithm_state.fifo.pointer}`;
                break;
            case "lru":
                details += `<strong>LRU Timestamps:</strong> ${JSON.stringify(algorithm_state.lru.timestamps)}`;
                break;
            case "optimal":
                details += "Optimal algorithm looks ahead in the sequence to make replacement decisions";
                break;
            case "clock":
                details += `<strong>Clock Pointer:</strong> ${algorithm_state.clock.pointer}<br>`;
                details += `<strong>Reference Bits:</strong> ${JSON.stringify(algorithm_state.clock.referenced)}`;
                break;
            case "nfu":
                details += `<strong>NFU Counters:</strong> ${JSON.stringify(algorithm_state.nfu.counters)}`;
                break;
            case "secondChance":
                details += `<strong>Second Chance Pointer:</strong> ${algorithm_state.secondChance.pointer}<br>`;
                details += `<strong>Second Chance Bits:</strong> ${JSON.stringify(algorithm_state.secondChance.secondChance)}`;
                break;
            case "workingSet":
                details += `<strong>Working Set Timestamps:</strong> ${JSON.stringify(algorithm_state.workingSet.timestamps)}`;
                break;
        }
        
        stepDetails.innerHTML = details;
        document.getElementById('stepDetails').classList.remove('hidden');
    }

    // Toggle step details visibility
    function toggleStepDetails() {
        const details = document.getElementById('stepDetails');
        details.classList.toggle('hidden');
    }

    // Save current simulation state
    function saveState() {
        const state = {
            algorithm,
            frames: [...frames],
            pageSequence: [...pageSequence],
            currentPageIndex,
            stats: {...stats},
            algorithm_state: JSON.parse(JSON.stringify(algorithm_state))
        };
        
        localStorage.setItem('pageReplacementSimState', JSON.stringify(state));
        addLog("Simulation state saved", "info");
    }

    // Load saved simulation state
    function loadState() {
        const savedState = localStorage.getItem('pageReplacementSimState');
        if (!savedState) {
            addLog("No saved state found", "error");
            return;
        }
        
        try {
            const state = JSON.parse(savedState);
            
            algorithm = state.algorithm;
            frames = [...state.frames];
            pageSequence = [...state.pageSequence];
            currentPageIndex = state.currentPageIndex;
            stats = {...state.stats};
            algorithm_state = JSON.parse(JSON.stringify(state.algorithm_state));
            
            // Update UI
            document.getElementById('algorithm').value = algorithm;
            document.getElementById('pageSequence').value = pageSequence.join(',');
            updateFramesDisplay();
            updatePageSequenceDisplay();
            updateStats();
            updateAlgorithmInfo();
            
            addLog("Simulation state loaded", "info");
        } catch (e) {
            addLog("Error loading saved state", "error");
            console.error(e);
        }
    }

    // Add bookmark to current state
    function addBookmark() {
        if (currentPageIndex < 0) {
            addLog("Cannot bookmark - simulation not started", "error");
            return;
        }
        
        const bookmarksList = document.getElementById('bookmarksList');
        if (!bookmarksList) return;
        
        bookmarksList.classList.remove('hidden');
        
        const bookmark = document.createElement('div');
        bookmark.classList.add('flex', 'justify-between', 'items-center', 'mb-2', 'p-2', 'bg-gray-700', 'rounded');
        
        const bookmarkText = document.createElement('span');
        bookmarkText.textContent = `Step ${currentPageIndex + 1}: Page ${pageSequence[currentPageIndex]}, Frames: [${frames.join(', ')}]`;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.classList.add('text-red-400', 'hover:text-red-300', 'cursor-pointer');
        deleteBtn.addEventListener('click', () => bookmark.remove());
        
        bookmark.appendChild(bookmarkText);
        bookmark.appendChild(deleteBtn);
        bookmarksList.appendChild(bookmark);
        
        addLog("Bookmark added", "info");
    }

    // Export visualization as image
    function exportVisualization() {
        // Get the content of the current page
        const pageContent = document.documentElement.innerHTML;
    
        // Create a new window for printing
        const printWindow = window.open('', '_blank');
    
        // Write the content into the new window
        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Page Report</title>
                <style>
                    /* Add any custom styles for the print view */
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                    }
                    .hidden-print {
                        display: none !important;
                    }
                </style>
            </head>
            <body>
                ${pageContent}
            </body>
            </html>
        `);
        printWindow.document.close();
    
        // Wait for the content to load and trigger the print dialog
        printWindow.onload = function () {
            printWindow.print();
            printWindow.close();
        };
    }
    
    // Add an event listener to the "Print Report" button
    document.getElementById('printReportBtn').addEventListener('click', printPageReport);

    // Download exported image
    function downloadExport() {
        const link = document.createElement('a');
        link.download = 'page-replacement-simulation.png';
        link.href = document.getElementById('exportPreview').dataset.canvas;
        link.click();
        closeExportModal();
    }

    // Close export modal
    function closeExportModal() {
        document.getElementById('exportModal').style.display = 'none';
    }

    // Close compare modal
    function closeCompareModal() {
        document.getElementById('compareModal').style.display = 'none';
    }

    // Close algorithm modal
    function closeAlgorithmModal() {
        document.getElementById('algorithmModal').style.display = 'none';
    }

    // Show algorithm GIF tooltip
    function showAlgorithmGif(algorithm) {
        const gifUrl = {
            fifo: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/FIFO-Page-Replacement.gif',
            lru: 'https://upload.wikimedia.org/wikipedia/commons/8/88/LRU.gif',
            optimal: 'https://www.gatevidyalay.com/wp-content/uploads/2018/09/Optimal-Page-Replacement-Algorithm-Example.png',
            clock: 'https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/images/Chapter9/9_15_ClockPageReplacement.jpg',
            nfu: 'https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/images/Chapter9/9_20_CountingAlgorithm.jpg',
            secondChance: 'https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/images/Chapter9/9_16_ClockPageReplacement.jpg',
            workingSet: 'https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/images/Chapter9/9_22_WorkingSetModel.jpg'
        };
        
        let gifTooltip = document.getElementById(`${algorithm}Gif`);
        if (!gifTooltip) {
            gifTooltip = document.createElement('div');
            gifTooltip.id = `${algorithm}Gif`;
            gifTooltip.className = 'gif-tooltip';
            document.body.appendChild(gifTooltip);
        }
        
        if (gifUrl[algorithm]) {
            gifTooltip.innerHTML = `<img src="${gifUrl[algorithm]}" width="200">`;
            gifTooltip.style.display = 'block';
            gifTooltip.style.left = `${event.clientX + 10}px`;
            gifTooltip.style.top = `${event.clientY + 10}px`;
        }
    }

    // Hide GIF tooltip
    function hideGifTooltip() {
        document.querySelectorAll('.gif-tooltip').forEach(tooltip => {
            tooltip.style.display = 'none';
        });
    }

    // Toggle theme between light and dark
    function toggleTheme() {
        document.body.classList.toggle('light-theme');
        const themeToggle = document.getElementById('themeToggle');
        themeToggle.textContent = document.body.classList.contains('light-theme') ? '🌞' : '🌙';
    }

    // Setup tutorial content
    function setupTutorial() {
        const tutorialContent = document.getElementById('tutorialContent');
        tutorialContent.innerHTML = `
            <div class="tutorial-step" data-step="1">
                <h3 class="font-bold mb-2">Welcome to the Page Replacement Simulator</h3>
                <p>This tool helps you visualize how different page replacement algorithms work in operating systems.</p>
            </div>
            <div class="tutorial-step hidden" data-step="2">
                <h3 class="font-bold mb-2">How to Use</h3>
                <ol class="list-decimal pl-5 space-y-1">
                    <li>Enter a page sequence or use a preset</li>
                    <li>Select the number of frames (1-5)</li>
                    <li>Choose an algorithm</li>
                    <li>Click Start or Step through</li>
                </ol>
            </div>
            <div class="tutorial-step hidden" data-step="3">
                <h3 class="font-bold mb-2">Algorithms Explained</h3>
                <ul class="list-disc pl-5 space-y-1">
                    <li><strong>FIFO:</strong> Replaces the oldest page</li>
                    <li><strong>LRU:</strong> Replaces least recently used page</li>
                    <li><strong>Optimal:</strong> Replaces page not needed for longest time (theoretical)</li>
                    <li><strong>Clock:</strong> Approximation of LRU with lower overhead</li>
                </ul>
            </div>
            <div class="tutorial-step hidden" data-step="4">
                <h3 class="font-bold mb-2">Visualization</h3>
                <p>The simulation shows:</p>
                <ul class="list-disc pl-5 space-y-1">
                    <li>Current memory frames</li>
                    <li>Page sequence with hits/faults</li>
                    <li>Algorithm-specific information</li>
                    <li>Performance statistics</li>
                </ul>
            </div>
            <div class="tutorial-step hidden" data-step="5">
                <h3 class="font-bold mb-2">Advanced Features</h3>
                <ul class="list-disc pl-5 space-y-1">
                    <li>Compare multiple algorithms</li>
                    <li>Save/Load simulation state</li>
                    <li>Bookmark interesting steps</li>
                    <li>Export visualizations</li>
                </ul>
            </div>
            <div class="tutorial-step hidden" data-step="6">
                <h3 class="font-bold mb-2">Ready to Start!</h3>
                <p>Try different sequences and algorithms to see how they perform.</p>
                <p class="mt-2 text-blue-400">Tip: Use the presets menu for interesting test cases.</p>
            </div>
        `;
    }

    // Show tutorial modal
    function showTutorial() {
        document.getElementById('tutorialModal').style.display = 'flex';
        document.querySelector('[data-step="1"]').classList.remove('hidden');
        document.getElementById('tutorialStep').textContent = 'Step 1/6';
    }

    // Close tutorial modal
    function closeTutorial() {
        document.getElementById('tutorialModal').style.display = 'none';
    }

    // Go to next tutorial step
    function tutorialNext() {
        const currentStep = document.querySelector('.tutorial-step:not(.hidden)').dataset.step;
        const nextStep = parseInt(currentStep) + 1;
        
        if (nextStep > 6) {
            closeTutorial();
            return;
        }
        
        document.querySelector(`[data-step="${currentStep}"]`).classList.add('hidden');
        document.querySelector(`[data-step="${nextStep}"]`).classList.remove('hidden');
        document.getElementById('tutorialStep').textContent = `Step ${nextStep}/6`;
    }

    // Go to previous tutorial step
    function tutorialPrev() {
        const currentStep = document.querySelector('.tutorial-step:not(.hidden)').dataset.step;
        const prevStep = parseInt(currentStep) - 1;
        
        if (prevStep < 1) return;
        
        document.querySelector(`[data-step="${currentStep}"]`).classList.add('hidden');
        document.querySelector(`[data-step="${prevStep}"]`).classList.remove('hidden');
        document.getElementById('tutorialStep').textContent = `Step ${prevStep}/6`;
    }
