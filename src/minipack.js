/**
 * 模块打包器将很多小的代码模块组合在一起并转换为现代浏览器能识别的形式
 * 这些小的代码模块就是普通的 js 文件，他们通过“模块系统”形成依赖关系
 * (https://webpack.js.org/concepts/modules).
 *
 * 模块打包器有“入口文件”的概念，区别于在浏览器中引入多个 <script> 标签作为入口文件，
 * 模块打包器以一个入口文件为起点，引导完成整个应用的打包
 *
 * 他会从入口文件开始寻找该文件依赖的文件，并继续寻找 依赖文件 依赖的文件。
 * 这个过程会持续到打包器分析完应用中所有文件的依赖关系为止。
 *
 * 这种以“文件间相互依赖的关系”视角描述项目的方式被称为“依赖图”
 *
 * 我们的打包器会首先建立依赖图，并基于其将所有模块打包为一个模块
 *
 * 让我们开始吧 :)
 *
 * 请注意：为了保证示例尽可能简单，很多功能（或问题）我们没有实现（或解决），比如：
 *  循环依赖
 *  模块导出的缓存
 *  每个模块只解析一次
 */

import fs from 'fs';
import path from 'path';

import babel from '@babel/core';
import createHTML from './createHTML.js';

let ID = 0;

// 我们首先创建一个函数，他接收一个文件路径作为参数
// 读取文件内容，并解析他的依赖
function createAsset(filename) {
  // 将文件内容读取为字符串
  const content = fs.readFileSync(filename, 'utf-8');

  // 接下来我们尝试找出该文件依赖的文件，可以通过读取文件内的 import 关键词来完成。
  // 在示例中，我们用 babel 完成这项工作

  // 作为JS解析器，babel 可以将 js 代码解析为一种被称为 AST（abstract syntax tree） 的抽象结构

  // 我强烈建议你在 AST Explorer (https://astexplorer.net)看看 AST 究竟长什么样

  // 在这里我们指明：我们的代码采用 ESM(EcmaScript modules) 模块系统，babel 会基于 ESM 的语法寻找文件的依赖关系
  const ast = babel.parseSync(content, {
    sourceType: 'module',
  });

  // 在该数组中保存当前模块依赖的模块的相对路径
  // 比如，当前模块中包含语法： import a from '../a.js';
  // 则 '../a.js' 会保存在该数组中
  const dependencies = [];

  // 使用 babel 提供的 traverse 方法遍历 AST并分析当前模块依赖的模块
  // 具体方法是：我们检查 AST 中每个 import 声明语句
  babel.traverse(ast, {
    // 由于 ESM 是静态的，所以要分析他很容易
    // “静态”意味着你不能引入一个变量，也不能根据条件引入其他模块
    // 每当我们看到一个 import 声明，就将他的值记录下来作为依赖
    ImportDeclaration: ({node}) => {
      // 将 import 的值存入 dependencies 数组中
      dependencies.push(node.source.value);
    },
  });

  // 我们使用一个自增的数字作为每个模块的唯一ID
  const id = ID++;

  // 由于现代浏览器不一定支持我们使用的 ESM 或其他 JS 特性，所以为了让打包后的代码能在浏览器中运行
  // 我们要转换以下目标代码（详情见 https://babeljs.io）

  // presets 选型包含了一批代码转换规则，经过转换，大部分浏览器能识别我们打包后的代码
  const {code} = babel.transformFromAstSync(ast, null, {
    presets: ['@babel/preset-env'],
  });

  // 返回该模块的所有信息
  return {
    // 模块唯一ID
    id,
    // 模块所在文件路径
    filename,
    // 依赖的模块的相对路径
    dependencies,
    // 转换后的代码
    // 注意：转换后的代码是 CJS 模块系统的，为了运行这种模块系统的代码，下面我们会特殊处理
    code,
  };
}

// 现在，我们已经可以解析一个模块的依赖关系了，让我们从入口文件开始解析

// 接下来，我们会解析每个依赖的依赖，这个过程会持续到解析完整个应用的依赖
// 最终会形成依赖图
function createGraph(entry) {
  // 从入口文件开始解析
  // 我们将“解析完的模块”称为“资源”
  const mainAsset = createAsset(entry);

  // 用队列保存整个应用的所有资源
  const queue = [mainAsset];

  // 通过 `for ... of` 遍历队列，最开始只有一个资源，但我们会分析他的依赖，
  // 将依赖解析为资源后会 push 到队列
  for (const asset of queue) {
    // queue只是所有资源形成的队列，他不保存资源之间的依赖关系
    // 所以在每个资源中通过 `mapping` 字段建立该资源与其依赖的资源间的联系
    asset.mapping = {};

    // 当前资源所在文件路径
    const dirname = path.dirname(asset.filename);

    // 遍历资源依赖的模块的相对路径
    asset.dependencies.forEach(relativePath => {
      // 我们的 `createAsset()` 方法传参是文件的绝对路径，而 dependencies 数组中保存的是相对路径
      // 所以需要将其先转化为绝对路径
      const absolutePath = path.join(dirname, relativePath);

      // 解析当前资源依赖的资源
      const child = createAsset(absolutePath);

      // 需要明确， child 是当前资源依赖的资源。
      // 通过在当前资源下增加 `mapping` 字段来表达 child 与 当前资源之间的依赖关系
      asset.mapping[relativePath] = child.id;

      // 最后，将 child push进队列，这会继续解析 child 依赖的资源
      queue.push(child);
    });
  }

  // 最终， queue 中保存应用中所有有依赖关系的资源，我们称该队列为依赖图
  return queue;
}

// 接下来，定义个函数，他接收依赖图，返回浏览器可以使用的打包好的代码

// 打包好的代码会包含在一个自执行函数中：

// (function() {})()

// 自执行函数接收一个对象作为参数，对象的结构如下：
// {
//   资源1 ID: [资源1的代码, 依赖的资源与其ID的对应关系],
//   资源2 ID: [资源2的代码, 依赖的资源与其ID的对应关系],
//   ...
// }

function bundle(graph) {
  // 注意观察下面 modules 的使用方式，他被 ({}) 包裹，
  // 所以 modules 实际内容是对象的 `key: value,` 形式，结构如下：
  //  资源ID: [资源的代码, 依赖的资源与其ID的对应关系],
  let modules = '';

  graph.forEach(asset => {
    // 每遍历一次会为 modules 增加一段 `资源ID: [资源的代码, 依赖的资源与其ID的对应关系],` 结构

    // 可以看到，`资源的代码` 被包裹在 `function (require, module, exports) {}` 中
    // 这是因为每个模块的代码应该拥有自己的作用域，模块1内的变量不应该影响模块2
    // 包裹函数有3个传参是因为调用 `babel.transformFromAstSync` 导出的代码是遵循 CJS 模块系统的
    // 比如：
    //  import a from './a.js';
    // 经过导出后会变为：
    //  require('./a.js')
    // 所以我们需要将 require 作为函数传参，同理另外两个传参

    // 对于 `依赖的资源与其ID的对应关系`，即 asset.mapping，结构类似：
    //  { './a.js': 1 }

    // 可以看到，上面例子中导出代码 `require('./a.js')`
    // 这里的 './a.js' 就能在 `{ './a.js': 1 }` 中找到该资源对应ID（即 1）
    // 通过 1 就能在 modules 中找到这个资源的代码及相应依赖：
    //  `1: [资源1的代码, 依赖的资源与其ID的对应关系],`
    modules += `${asset.id}: [
      function (require, module, exports) {
        ${asset.code}
      },
      ${JSON.stringify(asset.mapping)},
    ],`;
  });

  // 最后，实现自执行函数的内部代码

  // 首先实现 `require()` 函数，该函数内部会执行 `资源的代码`
  // 刚才说过，`资源的代码` 会被导出为 CJS 格式，所以需要实现 require 函数用于引入依赖的资源对应的 `资源的代码`
  // 同时，当前 `资源的代码` 可能会有导出的数据，所以需要创建保存导出数据的对象 module
  // 总结下，require 函数内部会做3件事：
  //  1. 创建 module 对象， const module = { exports : {} };
  //  2. 实现 require 方法
  //  3. 调用 `资源的代码`，并将 require、module、module.exports 作为参数传入
  //  4. 返回 module.exports

  // 在自执行函数的最后，调用 require(0)，开始执行 ID 为 0（即入口资源）的 `资源的代码`
  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(name) {
          return require(mapping[name]);
        }

        const module = { exports : {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0);
    })({${modules}})
  `;

  return result;
}

const graph = createGraph('./example/a.js');
const result = bundle(graph);

// 在浏览器中打开 output.html 运行打包后的代码
createHTML('./output.html', result);
