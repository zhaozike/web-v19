'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreatePage() {
  const [prompt, setPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  const suggestedTags = [
    '冒险', '友谊', '勇气', '魔法', '动物', '公主', '王子', 
    '森林', '海洋', '太空', '恐龙', '独角兽', '彩虹'
  ];

  const addTag = (tag: string) => {
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setNewTag('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsGenerating(true);
    
    try {
      // 这里将调用Suna AI API
      const response = await fetch('/api/suna/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          tags: tags,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // 重定向到生成进度页面
        router.push(`/generate/${data.taskId}`);
      } else {
        throw new Error('生成失败');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('生成绘本时出现错误，请稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-yellow-50">
      {/* Header */}
      <header className="p-4 flex justify-between items-center max-w-7xl mx-auto">
        <Link href="/" className="text-2xl font-bold text-purple-600">
          🎨 AI绘本工坊
        </Link>
        <Link href="/library" className="btn btn-outline btn-sm">
          我的绘本库
        </Link>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-800 mb-4">
            创造属于你的
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
              魔法故事
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            告诉我们你想要什么样的故事，AI将为你创造一个独一无二的绘本世界
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl p-8 lg:p-12">
          {/* 故事描述输入 */}
          <div className="mb-8">
            <label htmlFor="prompt" className="block text-xl font-semibold text-gray-700 mb-4">
              🌟 描述你想要的故事
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：一只小兔子在魔法森林里寻找彩虹糖果的冒险故事..."
              className="w-full h-32 p-4 border-2 border-gray-200 rounded-2xl focus:border-purple-500 focus:outline-none resize-none text-lg"
              required
            />
            <div className="text-sm text-gray-500 mt-2">
              {prompt.length}/500 字符
            </div>
          </div>

          {/* 标签选择 */}
          <div className="mb-8">
            <label className="block text-xl font-semibold text-gray-700 mb-4">
              🏷️ 选择故事元素
            </label>
            
            {/* 已选标签 */}
            {tags.length > 0 && (
              <div className="mb-4">
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-2 text-purple-600 hover:text-purple-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 建议标签 */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">推荐标签：</p>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    disabled={tags.includes(tag)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      tags.includes(tag)
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义标签输入 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="添加自定义标签..."
                className="flex-1 p-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(newTag);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => addTag(newTag)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                添加
              </button>
            </div>
          </div>

          {/* 生成按钮 */}
          <div className="text-center">
            <button
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              className={`btn btn-primary btn-lg px-12 py-4 text-lg font-semibold rounded-2xl shadow-lg transform transition-all duration-200 ${
                isGenerating 
                  ? 'loading' 
                  : 'hover:scale-105 hover:shadow-xl'
              }`}
            >
              {isGenerating ? (
                <>
                  <span className="loading loading-spinner"></span>
                  AI正在创作中...
                </>
              ) : (
                <>
                  ✨ 开始创作绘本
                </>
              )}
            </button>
            
            {!prompt.trim() && (
              <p className="text-sm text-gray-500 mt-2">
                请先描述你想要的故事
              </p>
            )}
          </div>
        </form>

        {/* 示例卡片 */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-8">
            创作灵感
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "小熊的太空冒险",
                description: "一只勇敢的小熊驾驶火箭去太空寻找星星朋友",
                tags: ["冒险", "太空", "友谊"]
              },
              {
                title: "魔法花园的秘密",
                description: "小女孩发现后院有一个会说话的魔法花园",
                tags: ["魔法", "花园", "秘密"]
              },
              {
                title: "海底王国历险记",
                description: "小鱼儿帮助海底王国找回失落的珍珠",
                tags: ["海洋", "冒险", "勇气"]
              }
            ].map((example, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <h3 className="font-bold text-lg text-gray-800 mb-2">{example.title}</h3>
                <p className="text-gray-600 text-sm mb-4">{example.description}</p>
                <div className="flex flex-wrap gap-1">
                  {example.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

