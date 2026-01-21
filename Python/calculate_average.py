#!/usr/bin/env python3
"""
CSV文件平均值计算脚本
读取当前项目目录下的scores.csv文件并计算平均值
"""

import pandas as pd
import os
import sys

def read_csv_file(file_path):
    """读取CSV文件并返回DataFrame"""
    try:
        df = pd.read_csv(file_path)
        print(f"成功读取文件: {file_path}")
        print(f"数据形状: {df.shape}")
        print(f"列名: {list(df.columns)}")
        return df
    except FileNotFoundError:
        print(f"错误: 文件未找到 - {file_path}")
        sys.exit(1)
    except Exception as e:
        print(f"读取文件时出错: {e}")
        sys.exit(1)

def calculate_averages(df):
    """计算各种平均值"""
    results = {}
    
    # 检查必要的列是否存在
    required_columns = ['数学', '英语', '物理']
    missing_columns = [col for col in required_columns if col not in df.columns]
    
    if missing_columns:
        print(f"错误: CSV文件中缺少以下列: {missing_columns}")
        print(f"可用列: {list(df.columns)}")
        sys.exit(1)
    
    # 1. 计算每门课程的平均分
    print("\n" + "="*50)
    print("每门课程的平均分:")
    print("="*50)
    
    for subject in required_columns:
        subject_avg = df[subject].mean()
        results[f'{subject}_平均分'] = subject_avg
        print(f"{subject}: {subject_avg:.2f}分")
    
    # 2. 计算每个学生的平均分
    print("\n" + "="*50)
    print("每个学生的平均分:")
    print("="*50)
    
    if '姓名' in df.columns:
        df['学生平均分'] = df[required_columns].mean(axis=1)
        for idx, row in df.iterrows():
            print(f"{row['姓名']}: {row['学生平均分']:.2f}分")
        results['学生平均分'] = df[['姓名', '学生平均分']]
    else:
        print("警告: CSV文件中没有'姓名'列，无法显示学生姓名")
        df['学生平均分'] = df[required_columns].mean(axis=1)
        for idx, avg in enumerate(df['学生平均分']):
            print(f"学生{idx+1}: {avg:.2f}分")
        results['学生平均分'] = df['学生平均分']
    
    # 3. 计算总体平均分
    print("\n" + "="*50)
    print("总体统计:")
    print("="*50)
    
    overall_avg = df[required_columns].values.mean()
    results['总体平均分'] = overall_avg
    print(f"所有科目总体平均分: {overall_avg:.2f}分")
    
    # 4. 显示详细统计信息
    print("\n" + "="*50)
    print("详细统计信息:")
    print("="*50)
    print(df[required_columns].describe())
    
    return results

def main():
    """主函数"""
    print("CSV文件平均值计算脚本")
    print("="*50)
    
    # 获取当前脚本所在目录的父目录（项目根目录）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    csv_file_path = os.path.join(project_root, 'scores.csv')
    
    print(f"项目根目录: {project_root}")
    print(f"CSV文件路径: {csv_file_path}")
    
    # 读取CSV文件
    df = read_csv_file(csv_file_path)
    
    # 显示前几行数据
    print("\n前5行数据:")
    print(df.head())
    
    # 计算平均值
    results = calculate_averages(df)
    
    print("\n" + "="*50)
    print("脚本执行完成!")
    print("="*50)
    
    return results

if __name__ == "__main__":
    main()
