import type { SourceFile } from '../syntax/SourceFile.js'
import type { HybridObjectSpec } from '../syntax/HybridObjectSpec.js'
import { createIndentation, indent } from '../utils.js'
import {
  createFileMetadataString,
  escapeCppName,
  isFunction,
  isNotDuplicate,
} from '../syntax/helpers.js'
import { getHybridObjectName } from '../syntax/getHybridObjectName.js'
import { includeHeader } from '../syntax/c++/includeNitroHeader.js'
import { createHostComponentJs } from './createHostComponentJs.js'
import { Property } from '../syntax/Property.js'
import { FunctionType } from '../syntax/types/FunctionType.js'
import { VoidType } from '../syntax/types/VoidType.js'
import { HybridObjectType } from '../syntax/types/HybridObjectType.js'
import { NamedWrappingType } from '../syntax/types/NamedWrappingType.js'
import { OptionalType } from '../syntax/types/OptionalType.js'

interface ViewComponentNames {
  propsClassName: `${string}Props`
  stateClassName: `${string}State`
  nameVariable: `${string}ComponentName`
  shadowNodeClassName: `${string}ShadowNode`
  descriptorClassName: `${string}ComponentDescriptor`
  component: `${string}Component`
  manager: `${string}Manager`
}

export function getViewComponentNames(
  spec: HybridObjectSpec
): ViewComponentNames {
  const name = getHybridObjectName(spec.name)
  return {
    propsClassName: `${name.HybridT}Props`,
    stateClassName: `${name.HybridT}State`,
    nameVariable: `${name.HybridT}ComponentName`,
    shadowNodeClassName: `${name.HybridT}ShadowNode`,
    descriptorClassName: `${name.HybridT}ComponentDescriptor`,
    component: `${name.HybridT}Component`,
    manager: `${name.HybridT}Manager`,
  }
}

function getHybridRefProperty(spec: HybridObjectSpec): Property {
  const hybrid = new HybridObjectType(spec)
  const type = new FunctionType(new VoidType(), [
    new NamedWrappingType('ref', hybrid),
  ])
  return new Property('hybridRef', new OptionalType(type), false)
}

export function createViewComponentShadowNodeFiles(
  spec: HybridObjectSpec
): SourceFile[] {
  if (!spec.isHybridView) {
    throw new Error(
      `Cannot create View Component ShadowNode code for ${spec.name} - it's not a HybridView!`
    )
  }

  const { T, HybridT } = getHybridObjectName(spec.name)
  const {
    propsClassName,
    stateClassName,
    nameVariable,
    shadowNodeClassName,
    descriptorClassName,
    component,
  } = getViewComponentNames(spec)

  const namespace = spec.config.getCxxNamespace('c++', 'views')

  const props = [...spec.properties, getHybridRefProperty(spec)]
  const properties = props.map(
    (p) => `CachedProp<${p.type.getCode('c++')}> ${escapeCppName(p.name)};`
  )
  const cases = props.map((p) => `case hashString("${p.name}"): return true;`)
  const includes = props
    .flatMap((p) =>
      p.getRequiredImports('c++').map((i) => includeHeader(i, true))
    )
    .filter(isNotDuplicate)
  const shadowIndent = createIndentation(shadowNodeClassName.length)
  const usesNativeLayoutBridge = spec.name === 'NitroUI' || spec.name === 'NitroRNHost'
  const preservesMeasuredSizeOnAdopt = spec.name === 'NitroRNHost'
  const androidDynamicInclude = usesNativeLayoutBridge
    ? `#ifdef ANDROID
#include <folly/dynamic.h>
#endif`
    : ''
  const androidDynamicIncludeBlock =
    androidDynamicInclude.length > 0 ? `\n${androidDynamicInclude}` : ''
  const stateClassDefinition = usesNativeLayoutBridge
    ? `  class ${stateClassName} final {
  public:
    ${stateClassName}() = default;
    explicit ${stateClassName}(
      const std::shared_ptr<${propsClassName}>& props,
      std::optional<double> width = std::nullopt,
      std::optional<double> height = std::nullopt,
      std::optional<double> styleWidth = std::nullopt,
      std::optional<double> styleHeight = std::nullopt):
      _props(props),
      _width(std::move(width)),
      _height(std::move(height)),
      _styleWidth(std::move(styleWidth)),
      _styleHeight(std::move(styleHeight)) {}

  public:
    [[nodiscard]]
    const std::shared_ptr<${propsClassName}>& getProps() const {
      return _props;
    }

    [[nodiscard]]
    const std::optional<double>& getWidth() const {
      return _width;
    }

    [[nodiscard]]
    const std::optional<double>& getHeight() const {
      return _height;
    }

    [[nodiscard]]
    const std::optional<double>& getStyleWidth() const {
      return _styleWidth;
    }

    [[nodiscard]]
    const std::optional<double>& getStyleHeight() const {
      return _styleHeight;
    }

  public:
#ifdef ANDROID
  ${stateClassName}(const ${stateClassName}& previousState, folly::dynamic data):
    _props(previousState._props),
    _width(previousState._width),
    _height(previousState._height),
    _styleWidth(previousState._styleWidth),
    _styleHeight(previousState._styleHeight) {
    if (!data.isObject()) {
      return;
    }

    if (const auto* width = data.get_ptr("width"); width != nullptr) {
      if (width->isNumber()) {
        _width = width->asDouble();
      } else if (width->isNull()) {
        _width = std::nullopt;
      }
    }

    if (const auto* height = data.get_ptr("height"); height != nullptr) {
      if (height->isNumber()) {
        _height = height->asDouble();
      } else if (height->isNull()) {
        _height = std::nullopt;
      }
    }

    if (const auto* styleWidth = data.get_ptr("styleWidth"); styleWidth != nullptr) {
      if (styleWidth->isNumber()) {
        _styleWidth = styleWidth->asDouble();
      } else if (styleWidth->isNull()) {
        _styleWidth = std::nullopt;
      }
    }

    if (const auto* styleHeight = data.get_ptr("styleHeight"); styleHeight != nullptr) {
      if (styleHeight->isNumber()) {
        _styleHeight = styleHeight->asDouble();
      } else if (styleHeight->isNull()) {
        _styleHeight = std::nullopt;
      }
    }
  }
  folly::dynamic getDynamic() const {
    folly::dynamic result = folly::dynamic::object();
    if (_width.has_value()) {
      result["width"] = _width.value();
    }
    if (_height.has_value()) {
      result["height"] = _height.value();
    }
    if (_styleWidth.has_value()) {
      result["styleWidth"] = _styleWidth.value();
    }
    if (_styleHeight.has_value()) {
      result["styleHeight"] = _styleHeight.value();
    }
    return result;
  }
  react::MapBuffer getMapBuffer() const {
    throw std::runtime_error("${stateClassName} does not support MapBuffer!");
  };
#endif

  private:
    std::shared_ptr<${propsClassName}> _props;
    std::optional<double> _width;
    std::optional<double> _height;
    std::optional<double> _styleWidth;
    std::optional<double> _styleHeight;
  };`
    : `  class ${stateClassName} final {
  public:
    ${stateClassName}() = default;
    explicit ${stateClassName}(const std::shared_ptr<${propsClassName}>& props):
      _props(props) {}

  public:
    [[nodiscard]]
    const std::shared_ptr<${propsClassName}>& getProps() const {
      return _props;
    }

  public:
#ifdef ANDROID
  ${stateClassName}(const ${stateClassName}& /* previousState */, folly::dynamic /* data */) {}
  folly::dynamic getDynamic() const {
    throw std::runtime_error("${stateClassName} does not support folly!");
  }
  react::MapBuffer getMapBuffer() const {
    throw std::runtime_error("${stateClassName} does not support MapBuffer!");
  };
#endif

  private:
    std::shared_ptr<${propsClassName}> _props;
  };`
  const shadowNodeDefinition = usesNativeLayoutBridge
    ? `  using ${shadowNodeClassName}Base = react::ConcreteViewShadowNode<${nameVariable} /* "${HybridT}" */,
        ${shadowIndent}                                     ${propsClassName} /* custom props */,
        ${shadowIndent}                                     react::ViewEventEmitter /* default */,
        ${shadowIndent}                                     ${stateClassName} /* custom state */>;

  class ${shadowNodeClassName} final : public ${shadowNodeClassName}Base {
  public:
    using ${shadowNodeClassName}Base::${shadowNodeClassName}Base;

    static react::ShadowNodeTraits BaseTraits() {
      auto traits = ${shadowNodeClassName}Base::BaseTraits();
      return traits;
    }
  };`
    : `  using ${shadowNodeClassName} = react::ConcreteViewShadowNode<${nameVariable} /* "${HybridT}" */,
        ${shadowIndent}                                 ${propsClassName} /* custom props */,
        ${shadowIndent}                                 react::ViewEventEmitter /* default */,
        ${shadowIndent}                                 ${stateClassName} /* custom state */>;`
  const cppExtraIncludes = usesNativeLayoutBridge
    ? `#include <cmath>
#include <limits>
#include <react/renderer/components/view/YogaLayoutableShadowNode.h>
#include <yoga/style/StyleSizeLength.h>`
    : ''
  const cppExtraIncludesBlock =
    cppExtraIncludes.length > 0 ? `\n${cppExtraIncludes}` : ''
  const adoptBody = usesNativeLayoutBridge
    ? `    std::optional<double> width = std::nullopt;
    std::optional<double> height = std::nullopt;
    std::optional<double> styleWidth = std::nullopt;
    std::optional<double> styleHeight = std::nullopt;
    if (shadowNode.getState() != nullptr) {
      const auto& previousStateData = static_cast<const ${shadowNodeClassName}::ConcreteState&>(*shadowNode.getState()).getData();
      ${preservesMeasuredSizeOnAdopt ? `width = previousStateData.getWidth();
      height = previousStateData.getHeight();
      ` : ''}styleWidth = previousStateData.getStyleWidth();
      styleHeight = previousStateData.getStyleHeight();
    }

    ${stateClassName} state{props, width, height, styleWidth, styleHeight};
    concreteShadowNode.setStateData(std::move(state));

    const auto& stateData = concreteShadowNode.getStateData();
    auto* layoutableShadowNode = dynamic_cast<react::YogaLayoutableShadowNode*>(&shadowNode);
    const auto& viewProps =
      *std::static_pointer_cast<const react::ViewProps>(concreteShadowNode.getProps());

    if (layoutableShadowNode != nullptr) {
      auto widthForSize = stateData.getWidth().has_value()
        ? static_cast<react::Float>(stateData.getWidth().value())
        : std::numeric_limits<react::Float>::quiet_NaN();
      auto heightForSize = stateData.getHeight().has_value()
        ? static_cast<react::Float>(stateData.getHeight().value())
        : std::numeric_limits<react::Float>::quiet_NaN();

      auto widthProp = viewProps.yogaStyle.dimension(facebook::yoga::Dimension::Width);
      auto heightProp = viewProps.yogaStyle.dimension(facebook::yoga::Dimension::Height);

      if (widthProp.isDefined() && widthProp.isPoints() && widthProp.value().isDefined()) {
        widthForSize = widthProp.value().unwrap();
      }
      if (heightProp.isDefined() && heightProp.isPoints() && heightProp.value().isDefined()) {
        heightForSize = heightProp.value().unwrap();
      }

      if (!std::isnan(widthForSize) || !std::isnan(heightForSize)) {
        layoutableShadowNode->setSize({widthForSize, heightForSize});
      }

      auto& style = const_cast<facebook::yoga::Style&>(viewProps.yogaStyle);
      auto targetWidth = widthProp;
      auto targetHeight = heightProp;

      if (stateData.getStyleWidth().has_value()) {
        targetWidth = facebook::yoga::StyleSizeLength::points(
          static_cast<float>(stateData.getStyleWidth().value())
        );
      }

      if (stateData.getStyleHeight().has_value()) {
        targetHeight = facebook::yoga::StyleSizeLength::points(
          static_cast<float>(stateData.getStyleHeight().value())
        );
      }

      bool changedStyle = false;
      if (!(style.dimension(facebook::yoga::Dimension::Width) == targetWidth)) {
        style.setDimension(facebook::yoga::Dimension::Width, targetWidth);
        changedStyle = true;
      }
      if (!(style.dimension(facebook::yoga::Dimension::Height) == targetHeight)) {
        style.setDimension(facebook::yoga::Dimension::Height, targetHeight);
        changedStyle = true;
      }

      if (changedStyle) {
        layoutableShadowNode->updateYogaProps();
        layoutableShadowNode->dirtyLayout();
      }
    }

    ConcreteComponentDescriptor::adopt(shadowNode);`
    : `    ${stateClassName} state{props};
    concreteShadowNode.setStateData(std::move(state));`
  // .hpp code
  const componentHeaderCode = `
${createFileMetadataString(`${component}.hpp`)}

#pragma once

#include <optional>
#include <NitroModules/NitroDefines.hpp>
#include <NitroModules/NitroHash.hpp>
#include <NitroModules/CachedProp.hpp>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/view/ViewProps.h>${androidDynamicIncludeBlock}

${includes.join('\n')}

namespace ${namespace} {

  using namespace facebook;

  /**
   * The name of the actual native View.
   */
  extern const char ${nameVariable}[];

  /**
   * Props for the "${spec.name}" View.
   */
  class ${propsClassName} final: public react::ViewProps {
  public:
    ${propsClassName}() = default;
    ${propsClassName}(const react::PropsParserContext& context,
  ${createIndentation(propsClassName.length)}   const ${propsClassName}& sourceProps,
  ${createIndentation(propsClassName.length)}   const react::RawProps& rawProps);

  public:
    ${indent(properties.join('\n'), '    ')}

  private:
    static bool filterObjectKeys(const std::string& propName);
  };

  /**
   * State for the "${spec.name}" View.
   */
${stateClassDefinition}

  /**
   * The Shadow Node for the "${spec.name}" View.
   */
${shadowNodeDefinition}

  /**
   * The Component Descriptor for the "${spec.name}" View.
   */
  class ${descriptorClassName} final: public react::ConcreteComponentDescriptor<${shadowNodeClassName}> {
  public:
    explicit ${descriptorClassName}(const react::ComponentDescriptorParameters& parameters);

  public:
    /**
     * A faster path for cloning props - reuses the caching logic from \`${propsClassName}\`.
     */
    std::shared_ptr<const react::Props> cloneProps(const react::PropsParserContext& context,
                                                   const std::shared_ptr<const react::Props>& props,
                                                   react::RawProps rawProps) const override;
#ifdef ANDROID
    void adopt(react::ShadowNode& shadowNode) const override;
#endif
  };

  /* The actual view for "${spec.name}" needs to be implemented in platform-specific code. */

} // namespace ${namespace}
`.trim()

  // .cpp code
  const propInitializers = [
    'react::ViewProps(context, sourceProps, rawProps, filterObjectKeys)',
  ]
  const propCopyInitializers = ['react::ViewProps()']
  for (const prop of props) {
    const name = escapeCppName(prop.name)
    const type = prop.type.getCode('c++')

    let valueConversion = `value`
    if (isFunction(prop.type)) {
      // Due to a React limitation, functions cannot be passed to native directly,
      // because RN converts them to booleans (`true`). Nitro knows this and just
      // wraps functions as objects - the original function is stored in `f`.
      valueConversion = `value.asObject(*runtime).getProperty(*runtime, PropNameIDCache::get(*runtime, "f"))`
    }

    propInitializers.push(
      `
${name}([&]() -> CachedProp<${type}> {
  try {
    const react::RawValue* rawValue = rawProps.at("${prop.name}", nullptr, nullptr);
    if (rawValue == nullptr) return sourceProps.${name};
    const auto& [runtime, value] = (std::pair<jsi::Runtime*, jsi::Value>)*rawValue;
    return CachedProp<${type}>::fromRawValue(*runtime, ${valueConversion}, sourceProps.${name});
  } catch (const std::exception& exc) {
    throw std::runtime_error(std::string("${spec.name}.${prop.name}: ") + exc.what());
  }
}())`.trim()
    )
    propCopyInitializers.push(`${name}(other.${name})`)
  }

  const ctorIndent = createIndentation(propsClassName.length * 2)
  const descriptorIndent = createIndentation(descriptorClassName.length)
  const componentCode = `
${createFileMetadataString(`${component}.cpp`)}

#include "${component}.hpp"

#include <string>
#include <exception>
#include <utility>
#include <NitroModules/NitroDefines.hpp>
#include <NitroModules/JSIConverter.hpp>
#include <NitroModules/PropNameIDCache.hpp>
#include <react/renderer/core/RawValue.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/core/ComponentDescriptor.h>
#include <react/renderer/components/view/ViewProps.h>${cppExtraIncludesBlock}

namespace ${namespace} {

  extern const char ${nameVariable}[] = "${T}";

  ${propsClassName}::${propsClassName}(const react::PropsParserContext& context,
  ${ctorIndent}   const ${propsClassName}& sourceProps,
  ${ctorIndent}   const react::RawProps& rawProps):
    ${indent(propInitializers.join(',\n'), '    ')} { }

  bool ${propsClassName}::filterObjectKeys(const std::string& propName) {
    switch (hashString(propName)) {
      ${indent(cases.join('\n'), '      ')}
      default: return false;
    }
  }

  ${descriptorClassName}::${descriptorClassName}(const react::ComponentDescriptorParameters& parameters)
    : ConcreteComponentDescriptor(parameters,
                                  react::RawPropsParser(/* enableJsiParser */ true)) {}

  std::shared_ptr<const react::Props> ${descriptorClassName}::cloneProps(const react::PropsParserContext& context,
                                      ${descriptorIndent}             const std::shared_ptr<const react::Props>& props,
                                      ${descriptorIndent}             react::RawProps rawProps) const {
    // 1. Prepare raw props parser
    rawProps.parse(rawPropsParser_);
    // 2. Copy props with Nitro's cached copy constructor
    return ${shadowNodeClassName}::Props(context, /* & */ rawProps, props);
  }

#ifdef ANDROID
  void ${descriptorClassName}::adopt(react::ShadowNode& shadowNode) const {
    // This is called immediately after \`ShadowNode\` is created, cloned or in progress.
    // On Android, we need to wrap props in our state, which gets routed through Java and later unwrapped in JNI/C++.
    auto& concreteShadowNode = static_cast<${shadowNodeClassName}&>(shadowNode);
    const std::shared_ptr<const ${propsClassName}>& constProps = concreteShadowNode.getConcreteSharedProps();
    const std::shared_ptr<${propsClassName}>& props = std::const_pointer_cast<${propsClassName}>(constProps);
${adoptBody}
  }
#endif

} // namespace ${namespace}
`.trim()

  const files: SourceFile[] = [
    {
      name: `${component}.hpp`,
      content: componentHeaderCode,
      language: 'c++',
      platform: 'shared',
      subdirectory: ['views'],
    },
    {
      name: `${component}.cpp`,
      content: componentCode,
      language: 'c++',
      platform: 'shared',
      subdirectory: ['views'],
    },
  ]
  const jsFiles = createHostComponentJs(spec)
  files.push(...(jsFiles as unknown as SourceFile[]))
  return files
}
