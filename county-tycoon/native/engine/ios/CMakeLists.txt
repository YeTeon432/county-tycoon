cmake_minimum_required(VERSION 3.8)

set(CMAKE_SYSTEM_NAME iOS)
set(APP_NAME "county-tycoon"  CACHE STRING "Project Name")

project(${APP_NAME} CXX)

set(CC_PROJECT_DIR ${CMAKE_CURRENT_LIST_DIR})
set(CC_UI_RESOURCES)
set(CC_PROJ_SOURCES)
set(CC_ASSET_FILES)
set(CC_COMMON_SOURCES)
set(CC_ALL_SOURCES)

include(${CC_PROJECT_DIR}/../common/CMakeLists.txt)
set(EXECUTABLE_NAME ${APP_NAME}-mobile)

if(XCODE_VERSION VERSION_GREATER_EQUAL "27" AND CMAKE_OSX_SYSROOT MATCHES "iphoneos")
    # The bundled archive predates the alignment required by Xcode 27.
    get_target_property(WEBP_ORIGINAL webp IMPORTED_LOCATION)
    set(WEBP_COMPAT_DIR "${CMAKE_CURRENT_BINARY_DIR}/compat")
    set(WEBP_REPACKED "${WEBP_COMPAT_DIR}/libwebp.a")
    if(NOT EXISTS "${WEBP_REPACKED}" OR "${WEBP_ORIGINAL}" IS_NEWER_THAN "${WEBP_REPACKED}")
        file(MAKE_DIRECTORY "${WEBP_COMPAT_DIR}")
        execute_process(COMMAND xcrun lipo "${WEBP_ORIGINAL}" -thin arm64
            -output "${WEBP_COMPAT_DIR}/webp-arm64.a" COMMAND_ERROR_IS_FATAL ANY)
        execute_process(COMMAND xcrun libtool -static -o "${WEBP_REPACKED}"
            "${WEBP_COMPAT_DIR}/webp-arm64.a" COMMAND_ERROR_IS_FATAL ANY)
    endif()
    set_target_properties(webp PROPERTIES IMPORTED_LOCATION "${WEBP_REPACKED}")
endif()

cc_ios_before_target(${EXECUTABLE_NAME})
add_executable(${EXECUTABLE_NAME} ${CC_ALL_SOURCES})
cc_ios_after_target(${EXECUTABLE_NAME})
