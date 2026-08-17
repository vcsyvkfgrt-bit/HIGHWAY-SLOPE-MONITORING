// 检查localStorage数据
import fs from 'fs';
import path from 'path';

// 由于localStorage在浏览器环境中，我们可以检查是否有模拟数据
const mockDataPath = path.join(import.meta.dirname, 'src', 'mock', 'data.js');

if (fs.existsSync(mockDataPath)) {
  console.log('Found mock data file:');
  console.log(fs.readFileSync(mockDataPath, 'utf8'));
} else {
  console.log('No mock data file found.');
}

// 检查是否有其他数据文件
const dataFiles = fs.readdirSync(import.meta.dirname).filter(file => file.endsWith('.json'));
if (dataFiles.length > 0) {
  console.log('\nFound JSON data files:');
  dataFiles.forEach(file => {
    console.log(`\n${file}:`);
    console.log(fs.readFileSync(path.join(import.meta.dirname, file), 'utf8'));
  });
} else {
  console.log('\nNo JSON data files found.');
}
