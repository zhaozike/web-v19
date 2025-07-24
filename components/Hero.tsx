import Image from "next/image";
import TestimonialsAvatars from "./TestimonialsAvatars";
import config from "@/config";
import Link from "next/link";

const Hero = () => {
  return (
    <section className="max-w-7xl mx-auto bg-gradient-to-br from-yellow-50 via-orange-50 to-pink-50 flex flex-col lg:flex-row items-center justify-center gap-16 lg:gap-20 px-8 py-8 lg:py-20">
      <div className="flex flex-col gap-10 lg:gap-14 items-center justify-center text-center lg:text-left lg:items-start">
        <h1 className="font-extrabold text-4xl lg:text-6xl tracking-tight md:-mb-4">
          <span className="text-orange-500">AI魔法</span>创造
          <br />
          <span className="text-blue-500">专属绘本</span>故事
        </h1>
        <p className="text-lg opacity-80 leading-relaxed max-w-md">
          让孩子成为故事的主角！只需输入简单的想法，AI就能为您的孩子创造独一无二的绘本故事，配有精美插图和温暖的旁白。
        </p>
        <Link 
          href="/create"
          className="btn btn-primary btn-wide text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
        >
          🎨 开始创作绘本
        </Link>

        <TestimonialsAvatars priority={true} />
      </div>
      <div className="lg:w-full">
        <Image
          src="https://images.unsplash.com/photo-1544947950-fa07a98d237f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80"
          alt="AI儿童绘本创作"
          className="w-full max-w-lg rounded-3xl shadow-2xl"
          priority={true}
          width={500}
          height={400}
        />
      </div>
    </section>
  );
};

export default Hero;

