#!/usr/bin/env python3
"""
Polaris SFT 蒸馏数据生成器 v1.0
────────────────────────────────
用 DeepSeek V4 批量求解优化问题，要求输出完整推理链。
V4 做老师 → 小模型做学生 → SFT 模仿推理模式。

产出格式 (JSONL):
  {"question": "...", "reasoning": "V4 的完整推理步骤", "answer": "最优解", "problem_type": "knapsack"}

用法:
  # 产 2000 条（推荐起点）
  python internal/scripts/distill_dataset.py 2000

  # 加 --offline 用算法解题（仅用于测试流程）
  python internal/scripts/distill_dataset.py 100 --offline
"""
import sys, os, json, random, time, argparse
from pathlib import Path

# ── Config ─────────────────────────────────────────────────
DATA_DIR = Path.home() / '.polaris' / 'training_data'
OUTPUT_FILE = DATA_DIR / 'sft_distillation.jsonl'

# DeepSeek API 配置
API_KEY = os.environ.get('DEEPSEEK_KEY', '')
API_URL = 'https://api.deepseek.com/chat/completions'
MODEL = 'deepseek-v4-flash'

# ── Problem generators ─────────────────────────────────────
def rand_int(a, b): return random.randint(a, b)

def gen_knapsack():
    n = rand_int(4, 30)
    vals = [rand_int(10, 500) for _ in range(n)]
    wts = [rand_int(5, 150) for _ in range(n)]
    cap = int(sum(wts) * (0.3 + random.random() * 0.5))
    q = f'0/1 knapsack: {n} items, capacity {cap}.\nvalues={vals}\nweights={wts}\nFind the optimal selection of items to maximize total value.'
    return q, 'knapsack', {'capacity': cap, 'values': vals, 'weights': wts}

def gen_scheduling():
    n = rand_int(3, 20)
    pt = [rand_int(1, 50) for _ in range(n)]
    q = f'Single machine scheduling: {n} jobs, processing times {pt}.\nMinimize total completion time. Output the optimal job order.'
    return q, 'scheduling', {'processing_times': pt}

def gen_assignment():
    n = rand_int(3, 12)
    matrix = [[rand_int(1, 30) for _ in range(n)] for _ in range(n)]
    q = f'Assignment problem: {n} workers, {n} tasks.\nCost matrix:\n{json.dumps(matrix)}\nMinimize total cost. Output optimal worker→task mapping.'
    return q, 'assignment', {'cost_matrix': matrix}

def gen_facility():
    k = rand_int(2, 8)
    m = rand_int(3, 15)
    pts = [{'x': rand_int(0, 100), 'y': rand_int(0, 100), 'demand': rand_int(1, 30)} for _ in range(m)]
    fc = [rand_int(50, 500) for _ in range(k)]
    q = f'Facility location: choose {k} sites from {m} candidates.\nDemand points: {json.dumps(pts)}\nFixed costs: {fc}\nMinimize transport + fixed costs.'
    return q, 'facility', {'num_facilities': k, 'demand_points': pts, 'fixed_costs': fc}

def gen_vrp():
    n = rand_int(3, 12)
    cap = rand_int(15, 80)
    k = rand_int(1, 5)
    dem = [0] + [rand_int(1, min(20, cap)) for _ in range(n)]
    dist = [[0] * (n + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        for j in range(n + 1):
            if i != j:
                dist[i][j] = dist[j][i] = rand_int(1, 100)
    q = f'CVRP: {n} customers, {k} vehicles, capacity {cap}.\nDemands: {dem}\nDistance matrix: {json.dumps(dist)}\nFind optimal routes.'
    return q, 'vrp', {'distance_matrix': dist, 'demands': dem, 'vehicle_capacity': cap, 'num_vehicles': k}

def gen_set_covering():
    m = rand_int(5, 15)
    n = rand_int(3, 10)
    sets = [[random.randint(0, 1) for _ in range(m)] for _ in range(n)]
    costs = [rand_int(1, 20) for _ in range(n)]
    q = f'Set covering: {n} sets, {m} elements.\nSets (binary): {json.dumps(sets)}\nCosts: {costs}\nSelect minimum-cost subset covering all elements.'
    return q, 'set_covering', {'sets': sets, 'costs': costs}

def gen_multi_knapsack():
    n = rand_int(4, 15)
    k = rand_int(2, 4)
    vals = [rand_int(10, 300) for _ in range(n)]
    wts = [rand_int(5, 100) for _ in range(n)]
    caps = [rand_int(30, 200) for _ in range(k)]
    q = f'Multiple knapsack: {n} items, {k} knapsacks.\nValues: {vals}\nWeights: {wts}\nCapacities: {caps}\nMaximize total value.'
    return q, 'multi_knapsack', {'capacities': caps, 'values': vals, 'weights': wts}

GENERATORS = {
    'knapsack': gen_knapsack,
    'scheduling': gen_scheduling,
    'assignment': gen_assignment,
    'facility': gen_facility,
    'vrp': gen_vrp,
    'set_covering': gen_set_covering,
    'multi_knapsack': gen_multi_knapsack,
}

# ── System prompt (V4 as teacher) ──────────────────────────
SYSTEM_PROMPT = """You are an expert in operations research and optimization. Solve the problem step by step.

Your response MUST follow this exact format:

[REASONING]
Step-by-step analysis:
1. Identify the problem type and its mathematical structure
2. List the key parameters and constraints
3. Explain the solution approach and why it's correct
4. If applicable, check edge cases and constraint violations

[SOLUTION]
Provide the complete optimal solution with all numerical values.
Use clear labels (e.g., "Selected items: [2, 5, 7]", "Total value: 340").
If the solution involves an ordering, list it explicitly.
"""

# ── Algorithmic fallback for offline mode ──────────────────
def algo_solve(problem_type, params):
    """Quick heuristic solutions for offline testing."""
    p = params  # alias for brevity
    if problem_type == 'knapsack':
        items = sorted([(p['values'][i]/p['weights'][i], i, p['values'][i], p['weights'][i])
                        for i in range(len(p['values']))], reverse=True)
        sel, tv, tw = [], 0, 0
        for ratio, idx, v, w in items:
            if tw + w <= p['capacity']:
                sel.append(idx); tv += v; tw += w
        return f"Selected items: {sel}\nTotal value: {tv}\nTotal weight: {tw}"
    elif problem_type == 'scheduling':
        order = sorted(range(len(p['processing_times'])), key=lambda i: p['processing_times'][i])
        return f"Optimal order (SPT): {order}"
    elif problem_type == 'assignment':
        n = len(p['cost_matrix'])
        used, pairs = set(), {}
        for i in range(n):
            best_j = min((j for j in range(n) if j not in used), key=lambda j: p['cost_matrix'][i][j])
            pairs[i] = best_j; used.add(best_j)
        total = sum(p['cost_matrix'][i][pairs[i]] for i in range(n))
        return f"Worker→Task: {pairs}\nTotal cost: {total}"
    elif problem_type == 'facility':
        sel = sorted(range(len(p['fixed_costs'])), key=lambda i: p['fixed_costs'][i])[:p['num_facilities']]
        return f"Selected facilities: {sel}"
    elif problem_type == 'vrp':
        n = len(p['demands']) - 1
        visited, routes, rc, cur = set(), [], p['vehicle_capacity'], 0
        route = [0]
        while len(visited) < n:
            candidates = [(j, p['distance_matrix'][cur][j]) for j in range(1, n+1)
                         if j not in visited and p['demands'][j] <= rc]
            if candidates:
                best = min(candidates, key=lambda x: x[1])
                route.append(best[0]); visited.add(best[0])
                rc -= p['demands'][best[0]]; cur = best[0]
            else:
                route.append(0); routes.append(route)
                route = [0]; rc = p['vehicle_capacity']; cur = 0
        route.append(0); routes.append(route)
        return f"Routes: {[' → '.join(map(str, r)) for r in routes]}"
    else:
        return "Solution computed."

# ── LLM call ───────────────────────────────────────────────
def call_v4(question, api_key):
    import urllib.request
    body = json.dumps({
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': question},
        ],
        'max_tokens': 2048,
        'temperature': 0.2,
    }).encode('utf-8')
    req = urllib.request.Request(API_URL, data=body, headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data['choices'][0]['message']['content']
    except Exception as e:
        print(f'  [API error: {e}]')
        return None

def parse_response(text):
    """Extract reasoning and solution from V4 output."""
    reasoning, solution = '', ''
    if '[REASONING]' in text and '[SOLUTION]' in text:
        parts = text.split('[SOLUTION]')
        reasoning = parts[0].replace('[REASONING]', '').strip()
        solution = parts[1].strip()
    elif '[REASONING]' in text:
        reasoning = text.replace('[REASONING]', '').strip()
        solution = text[-500:] if len(text) > 500 else text
    else:
        solution = text
    return reasoning, solution

# ── Concurrent worker ──────────────────────────────────────
def worker_task(args_tuple):
    """Single task: generate problem → call V4 → return result."""
    api_key, offline = args_tuple
    ptype = random.choice(list(GENERATORS.keys()))
    question, ptype, params = GENERATORS[ptype]()

    if not offline and api_key:
        response = call_v4(question, api_key)
        if response and len(response) > 20:
            reasoning, solution = parse_response(response)
            return {
                'question': question, 'reasoning': reasoning, 'answer': solution,
                'problem_type': ptype, 'source': 'v4_distillation',
                'ts': time.strftime('%Y-%m-%dT%H:%M:%S'),
            }, True
    # Fallback: algorithmic
    reasoning = f'Algorithmic heuristic for {ptype} problem.'
    solution = algo_solve(ptype, params)
    return {
        'question': question, 'reasoning': reasoning, 'answer': solution,
        'problem_type': ptype, 'source': 'algorithmic',
        'ts': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }, False

# ── Main ───────────────────────────────────────────────────
def main():
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading
    parser = argparse.ArgumentParser(description='Polaris SFT distillation data generator')
    parser.add_argument('count', nargs='?', type=int, default=2000, help='Number of problems')
    parser.add_argument('--offline', action='store_true', help='Algorithmic mode (no API)')
    parser.add_argument('--workers', type=int, default=20, help='Concurrent API workers')
    parser.add_argument('--key', type=str, default=API_KEY, help='DeepSeek API key')
    args = parser.parse_args()

    # API key
    api_key = args.key
    if not args.offline and not api_key:
        # Try loading from secrets vault via Node
        try:
            import subprocess
            secrets_js = str((Path(__file__).parent.parent / 'services' / 'secrets.js').resolve())
            # Use forward slashes for Node require() on Windows
            secrets_js = secrets_js.replace('\\', '/')
            key_script = 'try{var s=require("%s");var k=s.get("deepseek_api_key");process.stdout.write(k||"")}catch(e){process.stdout.write("")}' % secrets_js
            r = subprocess.run(['node', '-e', key_script], capture_output=True, text=True, timeout=5)
            api_key = r.stdout.strip()
        except:
            pass
    if not args.offline and not api_key:
        # Second fallback: env var
        api_key = os.environ.get('DEEPSEEK_KEY', '')
        print('[WARN] Falling back to offline mode.\n')
        args.offline = True

    mode = 'LLM (DeepSeek V4)' if not args.offline else 'Algorithmic (offline)'
    print(f'Generating {args.count} SFT distillation samples...')
    print(f'Mode: {mode}  |  Workers: {args.workers}')
    print(f'Output: {OUTPUT_FILE}\n')

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    total, v4_success, algo_fallback = 0, 0, 0
    write_lock = threading.Lock()
    start = time.time()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(worker_task, (api_key, args.offline)): i for i in range(args.count)}
        f_out = open(OUTPUT_FILE, 'a', encoding='utf-8')

        for i, future in enumerate(as_completed(futures)):
            try:
                record, v4 = future.result()
                with write_lock:
                    f_out.write(json.dumps(record, ensure_ascii=False) + '\n')
                    f_out.flush()
                total += 1
                if v4: v4_success += 1
                else: algo_fallback += 1
            except Exception as e:
                total += 1; algo_fallback += 1

            if (i + 1) % 100 == 0:
                elapsed = time.time() - start
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                print(f'  {i+1}/{args.count} ({elapsed:.0f}s, {rate:.1f}/s) | V4: {v4_success}  fallback: {algo_fallback}')

        f_out.close()

    elapsed = time.time() - start
    file_size = OUTPUT_FILE.stat().st_size / 1024 if OUTPUT_FILE.exists() else 0
    print(f'\n{"="*56}')
    print(f'  DISTILLATION COMPLETE')
    print(f'{"="*56}')
    print(f'  Time:       {elapsed:.0f}s')
    print(f'  Total:      {total}')
    print(f'  V4 solved:  {v4_success} ({v4_success*100//max(1,total)}%)')
    print(f'  Fallback:   {algo_fallback}')
    print(f'  File:       {OUTPUT_FILE} ({file_size:.0f} KB)')
    print(f'  Workers:    {args.workers}')
    print(f'\n  Ready for SFT phase: python scripts/dpo_train.py --sft-only')

if __name__ == '__main__':
    main()
