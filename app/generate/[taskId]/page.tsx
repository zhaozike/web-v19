'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface GenerationStatus {
  status: string;
  progress: number;
  message: string;
  estimated_time?: number;
}

interface GenerationResult {
  title: string;
  content: string;
  pages: any[];
  images: string[];
  audio?: string;
  metadata: any;
}

export default function GeneratePage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;
  
  const [status, setStatus] = useState<GenerationStatus>({
    status: 'pending',
    progress: 0,
    message: '正在准备创作...',
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const pollStatus = async () => {
      try {
        // 这里需要实际的认证token，暂时模拟
        const response = await fetch(`/api/suna/status?taskId=${taskId}`, {
          headers: {
            'Authorization': 'Bearer mock-token', // 实际应用中需要从认证状态获取
          },
        });

        if (!response.ok) {
          throw new Error('状态查询失败');
        }

        const data = await response.json();
        setStatus(data);

        // 如果完成，获取结果
        if (data.status === 'completed') {
          const resultResponse = await fetch(`/api/suna/result?taskId=${taskId}`, {
            headers: {
              'Authorization': 'Bearer mock-token',
            },
          });

          if (resultResponse.ok) {
            const resultData = await resultResponse.json();
            setResult(resultData.result);
          }
        } else if (data.status === 'failed') {
          setError('绘本生成失败，请重试');
        }
      } catch (err) {
        console.error('Status polling error:', err);
        setError('无法获取生成状态');
      }
    };

    // 立即执行一次
    pollStatus();

    // 如果未完成，每3秒轮询一次
    const interval = setInterval(() => {
      if (status.status !== 'completed' && status.status !== 'failed') {
        pollStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [taskId, status.status]);

  const handleSaveBook = async () => {
    if (!result) return;

    try {
      const response = await fetch('/api/suna/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token',
        },
        body: JSON.stringify({
          taskId,
          bookData: result,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/read/${data.bookId}`);
      } else {
        throw new Error('保存失败');
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('保存绘本时出现错误');
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl p-12 text-center max-w-md">
          <div className="text-6xl mb-6">😞</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">出现了问题</h1>
          <p className="text-gray-600 mb-8">{error}</p>
          <Link href="/create" className="btn btn-primary">
            重新创作
          </Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
        <header className="p-4 flex justify-between items-center max-w-7xl mx-auto">
          <Link href="/" className="text-2xl font-bold text-purple-600">
            🎨 AI绘本工坊
          </Link>
          <Link href="/library" className="btn btn-outline btn-sm">
            我的绘本库
          </Link>
        </header>

        <main className="max-w-4xl mx-auto px-8 py-12">
          <div className="text-center mb-12">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-4xl font-bold text-gray-800 mb-4">
              绘本创作完成！
            </h1>
            <p className="text-lg text-gray-600">
              您的专属绘本已经准备好了
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">{result.title}</h2>
            
            {result.images.length > 0 && (
              <div className="mb-6">
                <img 
                  src={result.images[0]} 
                  alt="绘本封面"
                  className="w-full max-w-md mx-auto rounded-2xl shadow-lg"
                />
              </div>
            )}

            <div className="prose max-w-none mb-6">
              <p className="text-gray-700 leading-relaxed">{result.content}</p>
            </div>

            <div className="flex gap-4 justify-center">
              <button 
                onClick={handleSaveBook}
                className="btn btn-primary btn-lg"
              >
                💾 保存到我的绘本库
              </button>
              <Link href="/create" className="btn btn-outline btn-lg">
                🎨 创作新绘本
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      <header className="p-4 flex justify-between items-center max-w-7xl mx-auto">
        <Link href="/" className="text-2xl font-bold text-purple-600">
          🎨 AI绘本工坊
        </Link>
        <Link href="/library" className="btn btn-outline btn-sm">
          我的绘本库
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            AI正在创作您的绘本
          </h1>
          <p className="text-lg text-gray-600">
            请稍等片刻，魔法正在发生...
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-12">
          {/* 进度条 */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">创作进度</span>
              <span className="text-sm font-medium text-gray-700">{status.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${status.progress}%` }}
              ></div>
            </div>
          </div>

          {/* 状态信息 */}
          <div className="text-center">
            <div className="text-4xl mb-4">
              {status.status === 'pending' && '⏳'}
              {status.status === 'processing' && '🎨'}
              {status.status === 'generating' && '✨'}
              {status.status === 'finalizing' && '🎁'}
            </div>
            <p className="text-lg text-gray-700 mb-4">{status.message}</p>
            
            {status.estimated_time && (
              <p className="text-sm text-gray-500">
                预计还需要 {Math.ceil(status.estimated_time / 60)} 分钟
              </p>
            )}
          </div>

          {/* 创作阶段指示器 */}
          <div className="mt-12">
            <div className="flex justify-between items-center">
              {[
                { key: 'pending', label: '准备中', icon: '📝' },
                { key: 'processing', label: '构思故事', icon: '💭' },
                { key: 'generating', label: '绘制插图', icon: '🎨' },
                { key: 'finalizing', label: '完善细节', icon: '✨' },
              ].map((stage, index) => (
                <div key={stage.key} className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2 ${
                    status.progress > index * 25 
                      ? 'bg-purple-100 text-purple-600' 
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {stage.icon}
                  </div>
                  <span className={`text-sm ${
                    status.progress > index * 25 
                      ? 'text-purple-600 font-medium' 
                      : 'text-gray-400'
                  }`}>
                    {stage.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

