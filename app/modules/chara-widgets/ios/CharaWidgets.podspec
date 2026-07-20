Pod::Spec.new do |s|
  s.name           = 'CharaWidgets'
  s.version        = '1.0.0'
  s.summary        = 'Publishes the Chara homescreen widget snapshot.'
  s.description    = 'Writes the widget snapshot into the App Group container and reloads WidgetKit timelines.'
  s.author         = ''
  s.homepage       = 'https://github.com/lucasdow/chara'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
